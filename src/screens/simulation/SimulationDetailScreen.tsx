import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent, GestureResponderHandlers } from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import SimulationPreview from '@/src/components/simulation/SimulationPreview';
import { colors } from '@/src/constants/colors';
import {
  CageObjectType,
  CageSimulationItem,
  CageSimulationObject,
  deleteCageSimulation,
  getCageSimulationById,
  updateCageSimulation,
} from '@/src/lib/cage-simulations';

const OBJECT_COLORS = ['#E4B66A', '#8FB9A8', '#D45B5B', '#7C9CC7', '#A78BFA'];
const PANEL_COLLAPSED_Y = 206;
const DRAG_CM_PER_PIXEL = 0.32;

type PanelTab = 'place' | 'edit' | 'cage';
type ObjectDragMode = 'move' | 'height';

export default function SimulationDetailScreen() {
  const params = useLocalSearchParams();
  const simulationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { height } = useWindowDimensions();
  const previewHeight = Math.max(360, height - 245);

  const [simulation, setSimulation] = useState<CageSimulationItem | null>(null);
  const [title, setTitle] = useState('');
  const [cageWidthCm, setCageWidthCm] = useState('');
  const [cageDepthCm, setCageDepthCm] = useState('');
  const [cageHeightCm, setCageHeightCm] = useState('');
  const [objects, setObjects] = useState<CageSimulationObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('place');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [objectDragMode, setObjectDragMode] = useState<ObjectDragMode | null>(null);
  const panelTranslateY = useRef(new Animated.Value(0)).current;
  const panelOffsetRef = useRef(0);
  const objectDragStartRef = useRef<Pick<CageSimulationObject, 'xCm' | 'yCm' | 'zCm'> | null>(null);
  const objectDragPointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const snapPanel = (nextOffset: number) => {
    panelOffsetRef.current = nextOffset;
    Animated.spring(panelTranslateY, {
      toValue: nextOffset,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const expandPanel = () => snapPanel(0);
  const collapsePanel = () => snapPanel(PANEL_COLLAPSED_Y);

  const panelPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderMove: (_, gesture) => {
        const nextOffset = clamp(panelOffsetRef.current + gesture.dy, 0, PANEL_COLLAPSED_Y);
        panelTranslateY.setValue(nextOffset);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 42 || gesture.vy > 0.35) {
          collapsePanel();
          return;
        }

        if (gesture.dy < -42 || gesture.vy < -0.35) {
          expandPanel();
          return;
        }

        snapPanel(panelOffsetRef.current > PANEL_COLLAPSED_Y / 2 ? PANEL_COLLAPSED_Y : 0);
      },
    })
  ).current;

  const selectPanelTab = (tab: PanelTab) => {
    setActiveTab(tab);
    expandPanel();
  };

  useEffect(() => {
    if (!simulationId) {
      setIsLoading(false);
      return;
    }

    const loadSimulation = async () => {
      try {
        setIsLoading(true);
        const nextSimulation = await getCageSimulationById(simulationId);
        setSimulation(nextSimulation);
        setTitle(nextSimulation.title);
        setCageWidthCm(String(nextSimulation.cage_width_cm));
        setCageDepthCm(String(nextSimulation.cage_depth_cm));
        setCageHeightCm(String(nextSimulation.cage_height_cm));
        setObjects(nextSimulation.objects);
        setSelectedObjectId(nextSimulation.objects[0]?.id ?? null);
      } catch (error) {
        Alert.alert(
          '시뮬레이션 불러오기 실패',
          error instanceof Error ? error.message : '시뮬레이션을 불러오지 못했습니다.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadSimulation();
  }, [simulationId]);

  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;

  const addObject = (type: CageObjectType) => {
    const nextObject: CageSimulationObject = {
      id: `${Date.now()}-${objects.length}`,
      type,
      label: type === 'cylinder' ? '원형 배치물' : '박스 배치물',
      xCm: Math.max(Number(cageWidthCm) / 2 || 10, 1),
      yCm: 0,
      zCm: Math.max(Number(cageDepthCm) / 2 || 10, 1),
      widthCm: type === 'cylinder' ? 9 : 14,
      depthCm: type === 'cylinder' ? 9 : 12,
      heightCm: type === 'cylinder' ? 12 : 10,
      rotationY: 0,
      color: OBJECT_COLORS[objects.length % OBJECT_COLORS.length],
    };

    setObjects((prev) => [...prev, nextObject]);
    setSelectedObjectId(nextObject.id);
    setActiveTab('edit');
  };

  const updateSelectedObject = (updates: Partial<CageSimulationObject>) => {
    if (!selectedObjectId) return;

    setObjects((prev) =>
      prev.map((object) =>
        object.id === selectedObjectId ? { ...object, ...updates } : object
      )
    );
  };

  const moveSelectedObject = (updates: Partial<Pick<CageSimulationObject, 'xCm' | 'yCm' | 'zCm'>>) => {
    if (!selectedObjectId) return;

    setObjects((prev) =>
      prev.map((object) => {
        if (object.id !== selectedObjectId) {
          return object;
        }

        return {
          ...object,
          ...getClampedObjectPosition(object, {
            widthCm: Number(cageWidthCm),
            depthCm: Number(cageDepthCm),
            heightCm: Number(cageHeightCm),
          }, updates),
        };
      })
    );
  };

  const applyObjectDragDelta = (mode: ObjectDragMode, dx: number, dy: number) => {
    if (!selectedObjectId) return;

    const startPosition = objectDragStartRef.current;
    if (!startPosition) return;

    const updates =
      mode === 'move'
        ? {
            xCm: startPosition.xCm + dx * DRAG_CM_PER_PIXEL,
            zCm: startPosition.zCm + dy * DRAG_CM_PER_PIXEL,
          }
        : {
            yCm: startPosition.yCm - dy * DRAG_CM_PER_PIXEL,
          };

    moveSelectedObject(updates);
  };

  const stopObjectDrag = () => {
    objectDragStartRef.current = null;
    objectDragPointerStartRef.current = null;
    setObjectDragMode(null);
  };

  const startObjectDrag = (mode: ObjectDragMode, event: GestureResponderEvent) => {
    if (!selectedObject) return;

    objectDragStartRef.current = {
      xCm: selectedObject.xCm,
      yCm: selectedObject.yCm,
      zCm: selectedObject.zCm,
    };
    objectDragPointerStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    setObjectDragMode(mode);
  };

  const createObjectDragResponder = (mode: ObjectDragMode) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!selectedObject,
      onMoveShouldSetPanResponder: () => !!selectedObject,
      onPanResponderGrant: (event) => startObjectDrag(mode, event),
      onPanResponderMove: (_, gesture) => {
        applyObjectDragDelta(mode, gesture.dx, gesture.dy);
      },
      onPanResponderRelease: stopObjectDrag,
      onPanResponderTerminate: stopObjectDrag,
    });

  const moveDragResponder = createObjectDragResponder('move');
  const heightDragResponder = createObjectDragResponder('height');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const previousCursor = document.body.style.cursor;
    if (!objectDragMode) {
      return;
    }

    document.body.style.cursor = 'none';

    const applyWebDragDelta = (dx: number, dy: number) => {
      const startPosition = objectDragStartRef.current;
      if (!startPosition || !selectedObjectId) return;

      const updates =
        objectDragMode === 'move'
          ? {
              xCm: startPosition.xCm + dx * DRAG_CM_PER_PIXEL,
              zCm: startPosition.zCm + dy * DRAG_CM_PER_PIXEL,
            }
          : {
              yCm: startPosition.yCm - dy * DRAG_CM_PER_PIXEL,
            };

      setObjects((prev) =>
        prev.map((object) => {
          if (object.id !== selectedObjectId) {
            return object;
          }

          return {
            ...object,
            ...getClampedObjectPosition(object, {
              widthCm: Number(cageWidthCm),
              depthCm: Number(cageDepthCm),
              heightCm: Number(cageHeightCm),
            }, updates),
          };
        })
      );
    };

    const finishWebDrag = () => {
      objectDragStartRef.current = null;
      objectDragPointerStartRef.current = null;
      setObjectDragMode(null);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const pointerStart = objectDragPointerStartRef.current;
      if (!pointerStart) return;

      applyWebDragDelta(event.pageX - pointerStart.x, event.pageY - pointerStart.y);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pointerStart = objectDragPointerStartRef.current;
      const touch = event.touches[0];
      if (!pointerStart || !touch) return;

      applyWebDragDelta(touch.pageX - pointerStart.x, touch.pageY - pointerStart.y);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', finishWebDrag);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', finishWebDrag);

    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', finishWebDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', finishWebDrag);
    };
  }, [cageDepthCm, cageHeightCm, cageWidthCm, objectDragMode, selectedObjectId]);

  const rotateSelectedObject = (direction: 1 | -1) => {
    if (!selectedObjectId) return;
    updateSelectedObject({ rotationY: (selectedObject?.rotationY ?? 0) + direction * (Math.PI / 6) });
  };

  const removeSelectedObject = () => {
    if (!selectedObjectId) return;

    setObjects((prev) => {
      const nextObjects = prev.filter((object) => object.id !== selectedObjectId);
      setSelectedObjectId(nextObjects[0]?.id ?? null);
      return nextObjects;
    });
  };

  const saveSimulation = async () => {
    if (!simulation) return;

    try {
      setIsSaving(true);
      const nextSimulation = await updateCageSimulation({
        simulationId: simulation.id,
        title,
        cageWidthCm: Number(cageWidthCm),
        cageDepthCm: Number(cageDepthCm),
        cageHeightCm: Number(cageHeightCm),
        objects,
        isPublic: simulation.is_public,
      });

      setSimulation(nextSimulation);
      setObjects(nextSimulation.objects);
      Alert.alert('저장 완료', '현재 배치가 저장되었습니다.');
    } catch (error) {
      Alert.alert(
        '저장 실패',
        error instanceof Error ? error.message : '시뮬레이션을 저장하지 못했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSimulation = () => {
    if (!simulation) return;

    const runDelete = async () => {
      try {
        setIsDeleting(true);
        await deleteCageSimulation(simulation.id);
        router.replace('/(tabs)/simulation');
      } catch (error) {
        Alert.alert(
          '삭제 실패',
          error instanceof Error ? error.message : '시뮬레이션을 삭제하지 못했습니다.'
        );
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' ? window.confirm('이 시뮬레이션을 삭제할까요?') : false;
      if (confirmed) void runDelete();
      return;
    }

    Alert.alert('시뮬레이션 삭제', '이 시뮬레이션을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  if (isLoading) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.stateText}>시뮬레이션 화면을 불러오는 중입니다...</Text>
      </ScreenContainer>
    );
  }

  if (!simulation) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <Text style={styles.stateTitle}>시뮬레이션을 찾을 수 없습니다.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/simulation')}>
          <Text style={styles.primaryButtonText}>목록으로 돌아가기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <SafeAreaView style={styles.simulatorScreen}>
      <View style={styles.stage}>
        <SimulationPreview
          widthCm={Number(cageWidthCm)}
          depthCm={Number(cageDepthCm)}
          heightCm={Number(cageHeightCm)}
          previewHeight={previewHeight}
          objects={objects}
          selectedObjectId={selectedObjectId}
          onObjectSelect={(objectId) => {
            setSelectedObjectId(objectId);
            setActiveTab('edit');
          }}
        />
        {selectedObject ? (
          <View
            style={[
              styles.objectOverlayControls,
              objectDragMode && styles.objectOverlayControlsHidden,
            ]}
            pointerEvents={objectDragMode ? 'none' : 'box-none'}>
            <View style={styles.objectTopControls}>
              <OverlayControlButton
                icon="trash-outline"
                variant="danger"
                onPress={removeSelectedObject}
              />
              <OverlayControlButton
                icon="swap-vertical"
                onPressIn={(event) => startObjectDrag('height', event)}
                panHandlers={heightDragResponder.panHandlers}
              />
            </View>
            <View style={styles.objectBottomControls}>
              <OverlayControlButton icon="return-down-back" onPress={() => rotateSelectedObject(-1)} />
              <OverlayControlButton
                icon="move"
                size="large"
                onPressIn={(event) => startObjectDrag('move', event)}
                panHandlers={moveDragResponder.panHandlers}
              />
              <OverlayControlButton icon="return-down-forward" onPress={() => rotateSelectedObject(1)} />
            </View>
          </View>
        ) : null}
        {objectDragMode ? <View style={styles.dragCursorHider} pointerEvents="none" /> : null}
      </View>

      <View style={styles.floatingHeader}>
        <Pressable style={styles.circleButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerBadge}>
          <Text style={styles.headerTitle}>3D 시뮬레이션</Text>
          <Text style={styles.headerMeta}>
            {cageWidthCm || '-'} x {cageDepthCm || '-'} x {cageHeightCm || '-'}cm
          </Text>
        </View>
        <Pressable
          style={[styles.headerSaveButton, isSaving && styles.disabled]}
          onPress={() => void saveSimulation()}
          disabled={isSaving}>
          <Text style={styles.headerSaveText}>{isSaving ? '저장 중' : '저장'}</Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.bottomPanel, { transform: [{ translateY: panelTranslateY }] }]}>
        <View style={styles.panelHandleArea} {...panelPanResponder.panHandlers}>
          <View style={styles.panelHandle} />
        </View>
        <View style={styles.tabRow}>
          <PanelButton
            active={activeTab === 'place'}
            icon="add-circle-outline"
            label="배치"
            onPress={() => selectPanelTab('place')}
          />
          <PanelButton
            active={activeTab === 'edit'}
            icon="options-outline"
            label="편집"
            onPress={() => selectPanelTab('edit')}
          />
          <PanelButton
            active={activeTab === 'cage'}
            icon="cube-outline"
            label="케이지"
            onPress={() => selectPanelTab('cage')}
          />
        </View>

        <ScrollView
          horizontal={activeTab !== 'edit'}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.panelContent,
            activeTab === 'edit' && styles.panelContentVertical,
          ]}>
          {activeTab === 'place' ? (
            <>
              <PlaceCard
                icon="cube-outline"
                title="박스 배치"
                description="은신처, 급수기, 사료통처럼 각진 물건"
                onPress={() => addObject('box')}
              />
              <PlaceCard
                icon="ellipse-outline"
                title="원형 배치"
                description="쳇바퀴, 밥그릇처럼 둥근 물건"
                onPress={() => addObject('cylinder')}
              />
            </>
          ) : null}

          {activeTab === 'edit' ? (
            selectedObject ? (
              <View style={styles.editPanel}>
                <TextInput
                  value={selectedObject.label}
                  onChangeText={(label) => updateSelectedObject({ label })}
                  placeholder="배치물 이름"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <View style={styles.colorRow}>
                  {OBJECT_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        selectedObject.color === color && styles.colorSwatchActive,
                      ]}
                      onPress={() => updateSelectedObject({ color })}
                    />
                  ))}
                </View>

                <Text style={styles.groupTitle}>위치</Text>
                <View style={styles.movePad}>
                  <View style={styles.movePadRow}>
                    <ControlButton label="앞" icon="arrow-up" onPress={() => moveSelectedObject({ zCm: selectedObject.zCm - 5 })} />
                  </View>
                  <View style={styles.movePadRow}>
                    <ControlButton label="왼쪽" icon="arrow-back" onPress={() => moveSelectedObject({ xCm: selectedObject.xCm - 5 })} />
                    <ControlButton label="위" icon="arrow-up-circle" onPress={() => moveSelectedObject({ yCm: selectedObject.yCm + 5 })} />
                    <ControlButton label="오른쪽" icon="arrow-forward" onPress={() => moveSelectedObject({ xCm: selectedObject.xCm + 5 })} />
                  </View>
                  <View style={styles.movePadRow}>
                    <ControlButton label="뒤" icon="arrow-down" onPress={() => moveSelectedObject({ zCm: selectedObject.zCm + 5 })} />
                    <ControlButton label="아래" icon="arrow-down-circle" onPress={() => moveSelectedObject({ yCm: selectedObject.yCm - 5 })} />
                  </View>
                </View>

                <Text style={styles.groupTitle}>회전</Text>
                <View style={styles.rotateRow}>
                  <ControlButton label="왼쪽 30도" icon="return-down-back" onPress={() => rotateSelectedObject(-1)} />
                  <ControlButton label="오른쪽 30도" icon="return-down-forward" onPress={() => rotateSelectedObject(1)} />
                </View>

                <Text style={styles.groupTitle}>정밀 위치</Text>
                <View style={styles.inputGrid}>
                  <NumberInput label="X" value={selectedObject.xCm} onChange={(xCm) => updateSelectedObject({ xCm })} />
                  <NumberInput label="Y" value={selectedObject.yCm} onChange={(yCm) => updateSelectedObject({ yCm })} />
                  <NumberInput label="Z" value={selectedObject.zCm} onChange={(zCm) => updateSelectedObject({ zCm })} />
                </View>

                <Text style={styles.groupTitle}>크기</Text>
                <View style={styles.inputGrid}>
                  <NumberInput label="가로" value={selectedObject.widthCm} onChange={(widthCm) => updateSelectedObject({ widthCm })} />
                  <NumberInput label="세로" value={selectedObject.depthCm} onChange={(depthCm) => updateSelectedObject({ depthCm })} />
                  <NumberInput label="높이" value={selectedObject.heightCm} onChange={(heightCm) => updateSelectedObject({ heightCm })} />
                </View>

                <View style={styles.objectList}>
                  {objects.map((object) => (
                    <Pressable
                      key={object.id}
                      style={[
                        styles.objectChip,
                        object.id === selectedObjectId && styles.objectChipActive,
                      ]}
                      onPress={() => setSelectedObjectId(object.id)}>
                      <View style={[styles.objectDot, { backgroundColor: object.color }]} />
                      <Text style={styles.objectChipText}>{object.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={styles.removeButton} onPress={removeSelectedObject}>
                  <Text style={styles.removeButtonText}>선택한 배치물 삭제</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyEditPanel}>
                <Text style={styles.emptyTitle}>선택된 배치물이 없어요.</Text>
                <Text style={styles.emptyText}>배치 탭에서 박스나 원형을 추가하면 편집 탭이 열립니다.</Text>
              </View>
            )
          ) : null}

          {activeTab === 'cage' ? (
            <>
              <View style={styles.cageCard}>
                <Text style={styles.cardTitle}>케이지 크기</Text>
                <View style={styles.inputGrid}>
                  <TextNumberInput label="가로" value={cageWidthCm} onChange={setCageWidthCm} />
                  <TextNumberInput label="세로" value={cageDepthCm} onChange={setCageDepthCm} />
                  <TextNumberInput label="높이" value={cageHeightCm} onChange={setCageHeightCm} />
                </View>
              </View>
              <View style={styles.cageCard}>
                <Text style={styles.cardTitle}>이름</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="시뮬레이션 이름"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.deleteButton, isDeleting && styles.disabled]}
                  onPress={deleteSimulation}
                  disabled={isDeleting}>
                  <Text style={styles.deleteButtonText}>
                    {isDeleting ? '삭제 중...' : '시뮬레이션 삭제'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function PanelButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={active ? '#FFFFFF' : colors.primaryStrong} />
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PlaceCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.placeCard} onPress={onPress}>
      <View style={styles.placeIcon}>
        <Ionicons name={icon} size={24} color={colors.primaryStrong} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDescription}>{description}</Text>
    </Pressable>
  );
}

function ControlButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.controlButton} onPress={onPress}>
      <Ionicons name={icon} size={17} color={colors.primaryStrong} />
      <Text style={styles.controlButtonText}>{label}</Text>
    </Pressable>
  );
}

function OverlayControlButton({
  icon,
  onPress,
  onPressIn,
  panHandlers,
  size = 'medium',
  variant = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  panHandlers?: GestureResponderHandlers;
  size?: 'medium' | 'large';
  variant?: 'default' | 'danger';
}) {
  return (
    <Pressable
      style={[
        styles.floatingControlButton,
        size === 'large' && styles.floatingControlButtonLarge,
      ]}
      onPress={onPress}
      onPressIn={onPressIn}
      {...panHandlers}>
      <Ionicons
        name={icon}
        size={size === 'large' ? 22 : 20}
        color={variant === 'danger' ? colors.danger : colors.primaryStrong}
      />
    </Pressable>
  );
}

function TextNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={String(value)}
        onChangeText={(nextValue) => onChange(Number(nextValue) || 0)}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

function getClampedObjectPosition(
  object: CageSimulationObject,
  cageSizeCm: { widthCm: number; depthCm: number; heightCm: number },
  updates: Partial<Pick<CageSimulationObject, 'xCm' | 'yCm' | 'zCm'>>
) {
  return {
    xCm: clamp(
      updates.xCm ?? object.xCm,
      object.widthCm / 2,
      Math.max(object.widthCm / 2, cageSizeCm.widthCm - object.widthCm / 2)
    ),
    yCm: clamp(
      updates.yCm ?? object.yCm,
      0,
      Math.max(0, cageSizeCm.heightCm - object.heightCm)
    ),
    zCm: clamp(
      updates.zCm ?? object.zCm,
      object.depthCm / 2,
      Math.max(object.depthCm / 2, cageSizeCm.depthCm - object.depthCm / 2)
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  simulatorScreen: {
    flex: 1,
    backgroundColor: '#DDE9E2',
  },
  stage: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  objectOverlayControls: {
    position: 'absolute',
    top: '42%',
    left: '50%',
    width: 176,
    height: 168,
    marginLeft: -88,
    marginTop: -84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objectOverlayControlsHidden: {
    opacity: 0,
  },
  dragCursorHider: {
    ...StyleSheet.absoluteFillObject,
  },
  objectTopControls: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  objectBottomControls: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  directionPad: {
    alignItems: 'center',
    gap: 8,
  },
  floatingControlButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(143, 185, 168, 0.32)',
    shadowColor: '#102019',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  floatingControlButtonSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  floatingControlButtonLarge: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  mirroredIcon: {
    transform: [{ scaleX: -1 }],
  },
  floatingHeader: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(143, 185, 168, 0.35)',
  },
  headerBadge: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(143, 185, 168, 0.35)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  headerMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  headerSaveButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  headerSaveText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 18,
    shadowColor: '#102019',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  panelHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C9D3CE',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primaryStrong,
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  panelContent: {
    gap: 12,
    paddingBottom: 10,
  },
  panelContentVertical: {
    flexGrow: 1,
    width: '100%',
  },
  placeCard: {
    width: 190,
    minHeight: 124,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    marginBottom: 10,
  },
  cageCard: {
    width: 280,
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  cardDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  editPanel: {
    width: '100%',
    gap: 12,
  },
  emptyEditPanel: {
    width: '100%',
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.background,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: colors.primaryStrong,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primaryStrong,
  },
  movePad: {
    display: 'none',
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: colors.background,
  },
  movePadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  rotateRow: {
    display: 'none',
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    flex: 1,
    minWidth: 92,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primaryStrong,
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    gap: 7,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
  },
  objectList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  objectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  objectChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  objectDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  objectChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F2B7B7',
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.danger,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F2B7B7',
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.danger,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});
