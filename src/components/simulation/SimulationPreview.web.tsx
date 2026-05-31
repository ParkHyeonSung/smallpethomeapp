/* eslint-disable react/no-unknown-property, @typescript-eslint/no-require-imports */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

type SimulationPreviewProps = {
  widthCm: number;
  depthCm: number;
  heightCm: number;
  previewHeight?: number;
  selectedObjectId?: string | null;
  onObjectSelect?: (objectId: string) => void;
  onObjectChange?: (objectId: string, updates: Partial<SimulationObject>) => void;
  onObjectDelete?: (objectId: string) => void;
  onSelectedObjectScreenPosition?: (position: SelectedObjectScreenProjection | null) => void;
  objects?: {
    id: string;
    type: 'box' | 'cylinder';
    xCm: number;
    yCm: number;
    zCm: number;
    widthCm: number;
    depthCm: number;
    heightCm: number;
    rotationY: number;
    color: string;
  }[];
};

type SimulationObject = NonNullable<SimulationPreviewProps['objects']>[number];
type PreviewObject = ReturnType<typeof normalizeObject>;
type ScreenVector = { x: number; y: number };
type SelectedObjectScreenProjection = ScreenVector & {
  basis: {
    xCm: ScreenVector;
    yCm: ScreenVector;
    zCm: ScreenVector;
  };
};
type ProjectableVector3 = {
  x: number;
  y: number;
  set: (x: number, y: number, z: number) => ProjectableVector3;
  project: (camera: unknown) => ProjectableVector3;
};
const { Vector3 } = require('three') as { Vector3: new () => ProjectableVector3 };

export default function SimulationPreview({
  widthCm,
  depthCm,
  heightCm,
  previewHeight = 220,
  selectedObjectId,
  onObjectSelect,
  onObjectChange,
  onObjectDelete,
  onSelectedObjectScreenPosition,
  objects = [],
}: SimulationPreviewProps) {
  const dimensions = normalizeDimensions(widthCm, depthCm, heightCm);
  const previewObjects = objects.map((object) =>
    normalizeObject(object, widthCm, depthCm, heightCm, dimensions)
  );
  const orbit = { elevation: 0.62, yaw: -0.72 };
  const [zoomScale, setZoomScale] = useState(1);
  const latestZoomRef = useRef(zoomScale);
  const pinchDistanceRef = useRef(0);
  const pinchZoomStartRef = useRef(1);
  const isZoomControlPressedRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event) =>
        !isZoomControlPressedRef.current && event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (event) =>
        !isZoomControlPressedRef.current && event.nativeEvent.touches.length >= 2,
      onPanResponderGrant: (event) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          pinchDistanceRef.current = getTouchDistance(touches);
          pinchZoomStartRef.current = latestZoomRef.current;
        }
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const nextDistance = getTouchDistance(touches);
          if (pinchDistanceRef.current > 0 && nextDistance > 0) {
            const nextZoom = clamp(
              pinchZoomStartRef.current * (pinchDistanceRef.current / nextDistance),
              0.62,
              1.65
            );
            latestZoomRef.current = nextZoom;
            setZoomScale(nextZoom);
          }
          return;
        }
      },
    })
  ).current;
  latestZoomRef.current = zoomScale;

  const updateZoom = (direction: 'in' | 'out') => {
    setZoomScale((currentZoom) => {
      const nextZoom = clamp(currentZoom + (direction === 'in' ? -0.14 : 0.14), 0.62, 1.65);
      latestZoomRef.current = nextZoom;
      return nextZoom;
    });
  };
  const handleWheel = (event: {
    preventDefault?: () => void;
    deltaY?: number;
    nativeEvent?: { deltaY?: number };
  }) => {
    event.preventDefault?.();
    const deltaY = event.deltaY ?? event.nativeEvent?.deltaY ?? 0;

    setZoomScale((currentZoom) => {
      const nextZoom = clamp(currentZoom + (deltaY < 0 ? -0.1 : 0.1), 0.62, 1.65);
      latestZoomRef.current = nextZoom;
      return nextZoom;
    });
  };
  const webWheelHandlers = { onWheel: handleWheel } as object;
  const selectedPreviewObject =
    previewObjects.find((object) => object.id === selectedObjectId) ?? null;

  return (
    <View
      style={[styles.container, { height: previewHeight }]}
      {...panResponder.panHandlers}
      {...webWheelHandlers}>
      <Canvas camera={{ position: [4.5, 4.2, 5.2], fov: 42 }}>
        <CameraOrbit dimensions={dimensions} orbit={orbit} zoomScale={zoomScale} />
        <SelectedObjectScreenPosition
          selectedObject={selectedPreviewObject}
          onPositionChange={onSelectedObjectScreenPosition}
        />
        <Scene
          dimensions={dimensions}
          objects={previewObjects}
          selectedObjectId={selectedObjectId ?? null}
          onObjectSelect={onObjectSelect}
          onObjectChange={onObjectChange}
          onObjectDelete={onObjectDelete}
          cageSizeCm={{
            widthCm: safeDimension(widthCm, 60),
            depthCm: safeDimension(depthCm, 40),
            heightCm: safeDimension(heightCm, 35),
          }}
        />
      </Canvas>
      <View style={styles.zoomControls}>
        <Pressable
          style={styles.zoomButton}
          onPress={() => updateZoom('in')}
          onPressIn={() => {
            isZoomControlPressedRef.current = true;
          }}
          onPressOut={() => {
            isZoomControlPressedRef.current = false;
          }}>
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable
          style={styles.zoomButton}
          onPress={() => updateZoom('out')}
          onPressIn={() => {
            isZoomControlPressedRef.current = true;
          }}
          onPressOut={() => {
            isZoomControlPressedRef.current = false;
          }}>
          <Text style={styles.zoomButtonText}>-</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CameraOrbit({
  dimensions,
  orbit,
  zoomScale,
}: {
  dimensions: { width: number; depth: number; height: number };
  orbit: { elevation: number; yaw: number };
  zoomScale: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const radius = (Math.max(dimensions.width, dimensions.depth) * 1.75 + 3.2) * zoomScale;
    const horizontalRadius = Math.cos(orbit.elevation) * radius;

    camera.position.set(
      Math.sin(orbit.yaw) * horizontalRadius,
      Math.sin(orbit.elevation) * radius,
      Math.cos(orbit.yaw) * horizontalRadius
    );
    camera.lookAt(0, dimensions.height * 0.12, 0);
    camera.updateProjectionMatrix();
  }, [camera, dimensions.depth, dimensions.height, dimensions.width, orbit.elevation, orbit.yaw, zoomScale]);

  return null;
}

function SelectedObjectScreenPosition({
  selectedObject,
  onPositionChange,
}: {
  selectedObject: PreviewObject | null;
  onPositionChange?: (position: SelectedObjectScreenProjection | null) => void;
}) {
  const { camera, size } = useThree();
  const projectedPositionRef = useRef(new Vector3());
  const lastPositionRef = useRef<SelectedObjectScreenProjection & { id: string } | null>(null);

  useEffect(() => {
    if (!selectedObject) {
      lastPositionRef.current = null;
      onPositionChange?.(null);
    }
  }, [onPositionChange, selectedObject]);

  useFrame(() => {
    if (!selectedObject || !onPositionChange) return;

    const center = projectWorldPoint(
      projectedPositionRef.current,
      camera,
      size,
      selectedObject.position[0],
      selectedObject.position[1],
      selectedObject.position[2]
    );
    const xPlus = projectWorldPoint(
      projectedPositionRef.current,
      camera,
      size,
      selectedObject.position[0] + selectedObject.scaleX,
      selectedObject.position[1],
      selectedObject.position[2]
    );
    const yPlus = projectWorldPoint(
      projectedPositionRef.current,
      camera,
      size,
      selectedObject.position[0],
      selectedObject.position[1] + selectedObject.scaleY,
      selectedObject.position[2]
    );
    const zPlus = projectWorldPoint(
      projectedPositionRef.current,
      camera,
      size,
      selectedObject.position[0],
      selectedObject.position[1],
      selectedObject.position[2] + selectedObject.scaleZ
    );

    const nextPosition: SelectedObjectScreenProjection & { id: string } = {
      id: selectedObject.id,
      x: center.x,
      y: center.y,
      basis: {
        xCm: { x: xPlus.x - center.x, y: xPlus.y - center.y },
        yCm: { x: yPlus.x - center.x, y: yPlus.y - center.y },
        zCm: { x: zPlus.x - center.x, y: zPlus.y - center.y },
      },
    };
    const lastPosition = lastPositionRef.current;

    if (
      !lastPosition ||
      lastPosition.id !== nextPosition.id ||
      Math.abs(lastPosition.x - nextPosition.x) > 0.5 ||
      Math.abs(lastPosition.y - nextPosition.y) > 0.5
    ) {
      lastPositionRef.current = nextPosition;
      onPositionChange(nextPosition);
    }
  });

  return null;
}

function projectWorldPoint(
  vector: ProjectableVector3,
  camera: unknown,
  size: { width: number; height: number },
  x: number,
  y: number,
  z: number
) {
  vector.set(x, y, z);
  vector.project(camera);

  return {
    x: ((vector.x + 1) / 2) * size.width,
    y: ((-vector.y + 1) / 2) * size.height,
  };
}

function Scene({
  dimensions,
  objects,
  selectedObjectId,
  onObjectSelect,
  onObjectChange,
  onObjectDelete,
  cageSizeCm,
}: {
  dimensions: { width: number; depth: number; height: number };
  objects: PreviewObject[];
  selectedObjectId: string | null;
  onObjectSelect?: (objectId: string) => void;
  onObjectChange?: (objectId: string, updates: Partial<SimulationObject>) => void;
  onObjectDelete?: (objectId: string) => void;
  cageSizeCm: { widthCm: number; depthCm: number; heightCm: number };
}) {
  const wallThickness = 0.08;
  const wallHeight = Math.max(dimensions.height * 0.32, 0.45);
  const helperSize = Math.max(dimensions.width, dimensions.depth);
  const gridSize = Math.max(helperSize * 4.8, 12);

  return (
    <>
      <color attach="background" args={['#EEF4F0']} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[4, 6, 5]} intensity={0.85} />

      <group>
        <mesh position={[0, -0.04, 0]}>
          <boxGeometry args={[dimensions.width, 0.08, dimensions.depth]} />
          <meshStandardMaterial color="#F8F6EF" transparent opacity={0.72} />
        </mesh>

        <gridHelper
          args={[gridSize, 32, '#789188', '#D3DED8']}
          position={[0, 0.012, 0]}
        />

        <mesh position={[0, wallHeight / 2, -dimensions.depth / 2]}>
          <boxGeometry args={[dimensions.width, wallHeight, wallThickness]} />
          <meshStandardMaterial color="#8FB9A8" transparent opacity={0.28} />
        </mesh>
        <mesh position={[0, wallHeight / 2, dimensions.depth / 2]}>
          <boxGeometry args={[dimensions.width, wallHeight, wallThickness]} />
          <meshStandardMaterial color="#8FB9A8" transparent opacity={0.28} />
        </mesh>
        <mesh position={[-dimensions.width / 2, wallHeight / 2, 0]}>
          <boxGeometry args={[wallThickness, wallHeight, dimensions.depth]} />
          <meshStandardMaterial color="#7CA798" transparent opacity={0.28} />
        </mesh>
        <mesh position={[dimensions.width / 2, wallHeight / 2, 0]}>
          <boxGeometry args={[wallThickness, wallHeight, dimensions.depth]} />
          <meshStandardMaterial color="#7CA798" transparent opacity={0.28} />
        </mesh>

        {objects.map((object) => (
          <group key={object.id}>
            <SelectableObject
              object={object}
              isSelected={object.id === selectedObjectId}
              onSelect={onObjectSelect}
            />
            {object.id === selectedObjectId && onObjectChange ? (
              <ObjectTransformGizmo
                object={object}
                onObjectChange={onObjectChange}
                onObjectDelete={onObjectDelete}
                cageSizeCm={cageSizeCm}
              />
            ) : null}
          </group>
        ))}
      </group>
    </>
  );
}

function SelectableObject({
  object,
  isSelected,
  onSelect,
}: {
  object: PreviewObject;
  isSelected: boolean;
  onSelect?: (objectId: string) => void;
}) {
  const selectObject = () => onSelect?.(object.id);
  const highlightSize = object.size.map((value) => value + 0.05) as [number, number, number];

  if (object.type === 'cylinder') {
    return (
      <group position={object.position} rotation={[0, object.rotationY, 0]} onPointerDown={selectObject}>
        <mesh>
          <cylinderGeometry args={[object.size[0] / 2, object.size[0] / 2, object.size[1], 24]} />
          <meshStandardMaterial color={object.color} />
        </mesh>
        {isSelected ? (
          <mesh>
            <cylinderGeometry args={[highlightSize[0] / 2, highlightSize[0] / 2, highlightSize[1], 24]} />
            <meshBasicMaterial color="#245C50" wireframe transparent opacity={0.9} />
          </mesh>
        ) : null}
      </group>
    );
  }

  return (
    <group position={object.position} rotation={[0, object.rotationY, 0]} onPointerDown={selectObject}>
      <mesh>
        <boxGeometry args={object.size} />
        <meshStandardMaterial color={object.color} />
      </mesh>
      {isSelected ? (
        <mesh>
          <boxGeometry args={highlightSize} />
          <meshBasicMaterial color="#245C50" wireframe transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

function ObjectTransformGizmo({
  object,
  onObjectChange,
  onObjectDelete,
  cageSizeCm,
}: {
  object: PreviewObject;
  onObjectChange?: (objectId: string, updates: Partial<SimulationObject>) => void;
  onObjectDelete?: (objectId: string) => void;
  cageSizeCm: { widthCm: number; depthCm: number; heightCm: number };
}) {
  const dragStartRef = useRef<{ x: number; y: number; object: PreviewObject } | null>(null);
  const maxObjectSide = Math.max(object.size[0], object.size[1], object.size[2]);
  const horizontalOffset = maxObjectSide * 0.78 + 0.38;
  const verticalOffset = object.size[1] / 2 + 0.42;

  const startDrag = (event: PointerLike) => {
    event.stopPropagation?.();
    const pointer = getPointerPosition(event);
    dragStartRef.current = pointer ? { ...pointer, object } : null;
  };

  const moveObjectOnFloor = (event: PointerLike) => {
    event.stopPropagation?.();
    const dragStart = dragStartRef.current;
    const pointer = getPointerPosition(event);
    if (!dragStart || !pointer) return;

    const nextPosition = getClampedObjectPosition(dragStart.object, cageSizeCm, {
      xCm: dragStart.object.xCm + (pointer.x - dragStart.x) * 0.18,
      zCm: dragStart.object.zCm + (pointer.y - dragStart.y) * 0.18,
    });

    onObjectChange?.(object.id, nextPosition);
  };

  const moveObjectHeight = (event: PointerLike) => {
    event.stopPropagation?.();
    const dragStart = dragStartRef.current;
    const pointer = getPointerPosition(event);
    if (!dragStart || !pointer) return;

    const nextPosition = getClampedObjectPosition(dragStart.object, cageSizeCm, {
      yCm: dragStart.object.yCm - (pointer.y - dragStart.y) * 0.18,
    });

    onObjectChange?.(object.id, nextPosition);
  };

  const endDrag = (event: PointerLike) => {
    event.stopPropagation?.();
    dragStartRef.current = null;
  };

  const rotateObject = (direction: 1 | -1) => {
    onObjectChange?.(object.id, {
      rotationY: object.rotationY + direction * (Math.PI / 6),
    });
  };

  return (
    <group position={object.position}>
      <GizmoButton
        position={[0, object.size[1] / 2 + 0.2, horizontalOffset]}
        icon="move"
        onStart={startDrag}
        onMove={(event) => moveObjectOnFloor(event)}
        onEnd={endDrag}
      />
      <GizmoButton
        position={[0.42, verticalOffset, 0]}
        icon="vertical"
        onStart={startDrag}
        onMove={(event) => moveObjectHeight(event)}
        onEnd={endDrag}
      />
      <GizmoButton
        position={[-0.42, verticalOffset, 0]}
        icon="trash"
        color="#D94A4A"
        onPress={() => onObjectDelete?.(object.id)}
      />
      <GizmoButton
        position={[-horizontalOffset, object.size[1] / 2 + 0.2, 0]}
        icon="rotate"
        onPress={() => rotateObject(-1)}
      />
      <GizmoButton
        position={[horizontalOffset, object.size[1] / 2 + 0.2, 0]}
        icon="rotate"
        mirror
        onPress={() => rotateObject(1)}
      />
    </group>
  );
}

type PointerLike = {
  pageX?: number;
  pageY?: number;
  clientX?: number;
  clientY?: number;
  nativeEvent?: {
    pageX?: number;
    pageY?: number;
    clientX?: number;
    clientY?: number;
  };
  pointerId?: number;
  target?: {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
  stopPropagation?: () => void;
};

function GizmoButton({
  position,
  icon,
  onStart,
  onMove,
  onEnd,
  onPress,
  color = '#31584F',
  mirror = false,
}: {
  position: [number, number, number];
  icon: 'move' | 'vertical' | 'trash' | 'rotate';
  onStart?: (event: PointerLike) => void;
  onMove?: (event: PointerLike) => void;
  onEnd?: (event: PointerLike) => void;
  onPress?: () => void;
  color?: string;
  mirror?: boolean;
}) {
  const handlePointerDown = (event: PointerLike) => {
    event.stopPropagation?.();
    capturePointer(event);
    setGlobalCursorHidden(true);
    onStart?.(event);
    if (!onStart) {
      onPress?.();
      setGlobalCursorHidden(false);
    }
  };

  const handlePointerEnd = (event: PointerLike) => {
    event.stopPropagation?.();
    releasePointer(event);
    setGlobalCursorHidden(false);
    onEnd?.(event);
  };

  return (
    <group
      position={position}
      onPointerDown={handlePointerDown}
      onPointerMove={(event: PointerLike) => onMove?.(event)}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}>
      <mesh>
        <circleGeometry args={[0.22, 36]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.96} depthTest={false} />
      </mesh>
      <group position={[0, 0, 0.045]} scale={[1.55, 1.55, 1.55]}>
        <GizmoIcon icon={icon} color={color} mirror={mirror} />
      </group>
      <mesh visible={false}>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

function GizmoIcon({
  icon,
  color,
  mirror,
}: {
  icon: 'move' | 'vertical' | 'trash' | 'rotate';
  color: string;
  mirror: boolean;
}) {
  if (icon === 'trash') {
    return (
      <mesh scale={[0.9, 1, 1]} position={[0, 0, 0.02]}>
        <boxGeometry args={[0.1, 0.14, 0.02]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  }

  if (icon === 'vertical') {
    return (
      <group>
        <mesh position={[0, 0.07, 0.02]}>
          <coneGeometry args={[0.05, 0.08, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, -0.07, 0.02]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.05, 0.08, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    );
  }

  if (icon === 'rotate') {
    return (
      <group scale={[mirror ? -1 : 1, 1, 1]}>
        <mesh position={[0, 0, 0.02]}>
          <torusGeometry args={[0.07, 0.014, 8, 20, Math.PI * 1.4]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0.07, 0, 0.02]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.035, 0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-0.07, 0, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.035, 0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.07, 0.02]}>
        <coneGeometry args={[0.035, 0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.07, 0.02]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.035, 0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTouchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  const firstTouch = touches[0];
  const secondTouch = touches[1];

  if (!firstTouch || !secondTouch) {
    return 0;
  }

  return Math.hypot(firstTouch.pageX - secondTouch.pageX, firstTouch.pageY - secondTouch.pageY);
}

function getPointerPosition(event: PointerLike) {
  const x = event.pageX ?? event.clientX ?? event.nativeEvent?.pageX ?? event.nativeEvent?.clientX;
  const y = event.pageY ?? event.clientY ?? event.nativeEvent?.pageY ?? event.nativeEvent?.clientY;

  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }

  return { x, y };
}

function capturePointer(event: PointerLike) {
  if (typeof event.pointerId === 'number') {
    event.target?.setPointerCapture?.(event.pointerId);
  }
}

function releasePointer(event: PointerLike) {
  if (typeof event.pointerId === 'number') {
    event.target?.releasePointerCapture?.(event.pointerId);
  }
}

function setGlobalCursorHidden(isHidden: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.cursor = isHidden ? 'none' : '';
}

function getClampedObjectPosition(
  object: PreviewObject,
  cageSizeCm: { widthCm: number; depthCm: number; heightCm: number },
  updates: Partial<Pick<SimulationObject, 'xCm' | 'yCm' | 'zCm'>>
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

function normalizeDimensions(widthCm: number, depthCm: number, heightCm: number) {
  const width = safeDimension(widthCm, 60);
  const depth = safeDimension(depthCm, 40);
  const height = safeDimension(heightCm, 35);
  const maxSide = Math.max(width, depth, 1);

  return {
    width: Math.max((width / maxSide) * 3.2, 1.4),
    depth: Math.max((depth / maxSide) * 3.2, 1.1),
    height: Math.max((height / maxSide) * 3.2, 1),
  };
}

function safeDimension(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeObject(
  object: NonNullable<SimulationPreviewProps['objects']>[number],
  widthCm: number,
  depthCm: number,
  heightCm: number,
  dimensions: { width: number; depth: number; height: number }
) {
  const safeWidthCm = safeDimension(widthCm, 60);
  const safeDepthCm = safeDimension(depthCm, 40);
  const safeHeightCm = safeDimension(heightCm, 35);
  const scaleX = dimensions.width / safeWidthCm;
  const scaleZ = dimensions.depth / safeDepthCm;
  const scaleY = dimensions.height / safeHeightCm;
  const width = Math.max(safeDimension(object.widthCm, 10) * scaleX, 0.12);
  const depth = Math.max(safeDimension(object.depthCm, 10) * scaleZ, 0.12);
  const height = Math.max(safeDimension(object.heightCm, 10) * scaleY, 0.12);

  return {
    id: object.id,
    type: object.type,
    xCm: object.xCm,
    yCm: object.yCm,
    zCm: object.zCm,
    widthCm: safeDimension(object.widthCm, 10),
    depthCm: safeDimension(object.depthCm, 10),
    heightCm: safeDimension(object.heightCm, 10),
    scaleX,
    scaleY,
    scaleZ,
    position: [
      (object.xCm - safeWidthCm / 2) * scaleX,
      object.yCm * scaleY + height / 2,
      (object.zCm - safeDepthCm / 2) * scaleZ,
    ] as [number, number, number],
    size: [width, height, depth] as [number, number, number],
    rotationY: object.rotationY,
    color: object.color,
  };
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#EEF4F0',
  },
  zoomControls: {
    position: 'absolute',
    right: 12,
    top: 86,
    gap: 8,
  },
  zoomButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(143, 185, 168, 0.45)',
  },
  zoomButtonText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    color: '#31584F',
  },
});
