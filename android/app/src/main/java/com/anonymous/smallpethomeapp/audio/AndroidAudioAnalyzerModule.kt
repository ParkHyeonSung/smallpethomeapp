package com.anonymous.smallpethomeapp.audio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

class AndroidAudioAnalyzerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  @Volatile
  private var isRunning = false
  private var recorder: AudioRecord? = null
  private var analyzerThread: Thread? = null
  private var latestSnapshot = AudioSnapshot()

  override fun getName(): String = "AndroidAudioAnalyzer"

  @ReactMethod
  fun start(sampleRate: Int, fftSize: Int, promise: Promise) {
    if (isRunning) {
      promise.resolve(snapshotToMap(latestSnapshot))
      return
    }

    if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("NO_MIC_PERMISSION", "Microphone permission is required.")
      return
    }

    val safeSampleRate = if (sampleRate == 44100 || sampleRate == 48000) sampleRate else 44100
    val safeFftSize = when (fftSize) {
      1024, 2048, 4096 -> fftSize
      else -> 2048
    }
    val minBufferSize = AudioRecord.getMinBufferSize(
      safeSampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val bufferSize = max(minBufferSize, safeFftSize * 2)

    try {
      recorder = AudioRecord(
        MediaRecorder.AudioSource.UNPROCESSED,
        safeSampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      )
    } catch (_: Exception) {
      recorder = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        safeSampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      )
    }

    val activeRecorder = recorder
    if (activeRecorder == null || activeRecorder.state != AudioRecord.STATE_INITIALIZED) {
      cleanupRecorder()
      promise.reject("AUDIO_RECORD_INIT_FAILED", "Failed to initialize Android AudioRecord.")
      return
    }

    isRunning = true
    latestSnapshot = AudioSnapshot(sampleRate = safeSampleRate, fftSize = safeFftSize)
    activeRecorder.startRecording()

    analyzerThread = thread(start = true, name = "AndroidAudioAnalyzer") {
      analyzeLoop(activeRecorder, safeSampleRate, safeFftSize)
    }

    promise.resolve(snapshotToMap(latestSnapshot))
  }

  @ReactMethod
  fun stop(promise: Promise) {
    isRunning = false
    cleanupRecorder()
    promise.resolve(snapshotToMap(latestSnapshot))
  }

  @ReactMethod
  fun getSnapshot(promise: Promise) {
    promise.resolve(snapshotToMap(latestSnapshot))
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for React Native event emitter compatibility.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for React Native event emitter compatibility.
  }

  private fun analyzeLoop(audioRecord: AudioRecord, sampleRate: Int, fftSize: Int) {
    val readBuffer = ShortArray(fftSize)
    val window = DoubleArray(fftSize) { i ->
      0.5 - 0.5 * cos((2.0 * PI * i) / (fftSize - 1))
    }

    while (isRunning) {
      val read = audioRecord.read(readBuffer, 0, readBuffer.size)
      if (read <= 0) continue

      val real = DoubleArray(fftSize)
      val imag = DoubleArray(fftSize)
      var squareSum = 0.0

      for (i in 0 until fftSize) {
        val sample = if (i < read) readBuffer[i] / 32768.0 else 0.0
        squareSum += sample * sample
        real[i] = sample * window[i]
      }

      fft(real, imag)

      val binWidth = sampleRate.toDouble() / fftSize.toDouble()
      var peakMagnitude = 0.0
      var peakFrequency = 0.0
      var lowBand = 0.0
      var midBand = 0.0
      var highBand = 0.0
      var marker32 = 0.0
      var marker125 = 0.0

      for (bin in 1 until fftSize / 2) {
        val frequency = bin * binWidth
        val magnitude = hypot(real[bin], imag[bin])

        if (frequency in 20.0..20000.0 && magnitude > peakMagnitude) {
          peakMagnitude = magnitude
          peakFrequency = frequency
        }

        when {
          frequency in 20.0..250.0 -> lowBand += magnitude
          frequency in 250.0..2000.0 -> midBand += magnitude
          frequency in 2000.0..20000.0 -> highBand += magnitude
        }

        if (abs(frequency - 32.5) <= binWidth) marker32 = max(marker32, magnitude)
        if (abs(frequency - 125.0) <= binWidth) marker125 = max(marker125, magnitude)
      }

      val rms = sqrt(squareSum / max(read, 1))
      val rmsDb = if (rms <= 0.0000001) -120.0 else 20.0 * (ln(rms) / ln(10.0))
      val snapshot = AudioSnapshot(
        sampleRate = sampleRate,
        fftSize = fftSize,
        rmsDb = rmsDb,
        peakFrequencyHz = peakFrequency,
        lowBandLevel = normalizeBand(lowBand),
        midBandLevel = normalizeBand(midBand),
        highBandLevel = normalizeBand(highBand),
        marker32HzLevel = normalizeBand(marker32),
        marker125HzLevel = normalizeBand(marker125)
      )

      latestSnapshot = snapshot
      emitSnapshot(snapshot)
    }
  }

  private fun fft(real: DoubleArray, imag: DoubleArray) {
    val n = real.size
    var j = 0
    for (i in 1 until n) {
      var bit = n shr 1
      while (j and bit != 0) {
        j = j xor bit
        bit = bit shr 1
      }
      j = j xor bit
      if (i < j) {
        val tempReal = real[i]
        real[i] = real[j]
        real[j] = tempReal
        val tempImag = imag[i]
        imag[i] = imag[j]
        imag[j] = tempImag
      }
    }

    var len = 2
    while (len <= n) {
      val angle = -2.0 * PI / len
      val wLenReal = cos(angle)
      val wLenImag = sin(angle)
      var i = 0
      while (i < n) {
        var wReal = 1.0
        var wImag = 0.0
        for (k in 0 until len / 2) {
          val evenIndex = i + k
          val oddIndex = i + k + len / 2
          val oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag
          val oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal

          real[oddIndex] = real[evenIndex] - oddReal
          imag[oddIndex] = imag[evenIndex] - oddImag
          real[evenIndex] += oddReal
          imag[evenIndex] += oddImag

          val nextWReal = wReal * wLenReal - wImag * wLenImag
          wImag = wReal * wLenImag + wImag * wLenReal
          wReal = nextWReal
        }
        i += len
      }
      len = len shl 1
    }
  }

  private fun normalizeBand(value: Double): Double {
    if (value <= 0.0) return 0.0
    return min(1.0, ln(1.0 + value) / 8.0)
  }

  private fun emitSnapshot(snapshot: AudioSnapshot) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AndroidAudioAnalyzerData", snapshotToMap(snapshot))
  }

  private fun snapshotToMap(snapshot: AudioSnapshot) = Arguments.createMap().apply {
    putInt("sampleRate", snapshot.sampleRate)
    putInt("fftSize", snapshot.fftSize)
    putDouble("rmsDb", snapshot.rmsDb)
    putDouble("peakFrequencyHz", snapshot.peakFrequencyHz)
    putDouble("lowBandLevel", snapshot.lowBandLevel)
    putDouble("midBandLevel", snapshot.midBandLevel)
    putDouble("highBandLevel", snapshot.highBandLevel)
    putDouble("marker32HzLevel", snapshot.marker32HzLevel)
    putDouble("marker125HzLevel", snapshot.marker125HzLevel)
  }

  private fun cleanupRecorder() {
    try {
      recorder?.stop()
    } catch (_: Exception) {
    }
    try {
      recorder?.release()
    } catch (_: Exception) {
    }
    recorder = null
  }
}

data class AudioSnapshot(
  val sampleRate: Int = 44100,
  val fftSize: Int = 2048,
  val rmsDb: Double = -120.0,
  val peakFrequencyHz: Double = 0.0,
  val lowBandLevel: Double = 0.0,
  val midBandLevel: Double = 0.0,
  val highBandLevel: Double = 0.0,
  val marker32HzLevel: Double = 0.0,
  val marker125HzLevel: Double = 0.0
)
