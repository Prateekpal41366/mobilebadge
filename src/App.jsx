import './App.css'
import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber'
import {
  useGLTF,
  useTexture,
  Environment,
  Lightformer,
  OrbitControls,
} from '@react-three/drei'
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  useRevoluteJoint,
  useRopeJoint,
  useSphericalJoint
} from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'

extend({ MeshLineGeometry, MeshLineMaterial })

useGLTF.preload('/cardtestglb.glb')

export default function App() {

  return (
    <Canvas
      camera={{ position: [0, 0, 13], fov: 30 }}
    >
      {/* <ambientLight intensity={10} /> */}

      {/* Force a pure white background */}
      <color attach="background" args={['#ffffff']} />

      <Suspense fallback={null}>
        <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
          <Band />
        </Physics>

        <Environment /* <- no background prop */ blur={0.75}>
          {/* <color attach="background" args={['#ffffff']} /> */}
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={30} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={30} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={30} color="white" position={[14, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Suspense>
    </Canvas>
  )
}

function Band({ maxSpeed = 50, minSpeed = 10 }) {
  const band = useRef()
  const fixed = useRef()
  const j1 = useRef()
  const j2 = useRef()
  const j3 = useRef()
  const ring = useRef()
  const holder = useRef()
  const card = useRef()

  const vec = useMemo(() => new THREE.Vector3(), [])
  const ang = useMemo(() => new THREE.Vector3(), [])
  const rot = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const segmentProps = useMemo(
    () => ({
      type: 'dynamic',
      canSleep: true,
      colliders: false,
      angularDamping: 2,
      linearDamping: 2
    }),
    []
  )

  const { nodes, materials } = useGLTF('./cardtestglb.glb')

  const { width, height } = useThree((state) => state.size)
  const [curve] = useState(() => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ])
    c.curveType = 'chordal'
    return c
  })

  const [dragged, setDragged] = useState(false)
  const [hovered, setHovered] = useState(false)

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, ring, [[0, 0, 0], [0, 0.23, 0]])
  useRevoluteJoint(ring, holder, [[0, -0.45, 0], [0, 0.14, 0], [1, 0, 0]])
  // useSphericalJoint(ring, holder, [[0, -0.45, 0], [0, 0.14, 0]])
  useRevoluteJoint(holder, card, [[0, -0.2, 0], [0, 0.96, 0], [0, 0, 1]])

  useEffect(() => {
    document.body.style.cursor = hovered
      ? dragged
        ? 'grabbing'
        : 'grab'
      : 'auto'
    return () => void (document.body.style.cursor = 'auto')
  }, [hovered, dragged])

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
        ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z
      })
    }

    if (fixed.current) {
      ;[j1, j2].forEach((ref) => {
        if (!ref.current.lerped)
          ref.current.lerped = new THREE.Vector3().copy(ref.current.translation())
        const dist = ref.current.lerped.distanceTo(ref.current.translation())
        const clamped = Math.max(0.1, Math.min(1, dist))
        ref.current.lerped.lerp(
          ref.current.translation(),
          delta * (minSpeed + clamped * (maxSpeed - minSpeed))
        )
      })

      curve.points[0].copy(j3.current.translation())
      curve.points[1].copy(j2.current.lerped)
      curve.points[2].copy(j1.current.lerped)
      curve.points[3].copy(fixed.current.translation())
      band.current.geometry.setPoints(curve.getPoints(20))

      ang.copy(card.current.angvel())
      rot.copy(card.current.rotation())
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z })
    }
  })

  const handlers = {
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
    onPointerUp: (e) => {
      e.target.releasePointerCapture(e.pointerId)
      setDragged(false)
    },
    onPointerDown: (e) => {
      e.target.setPointerCapture(e.pointerId)
      setDragged(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
    }
  }

  return (
    <>
      <group position={[0, 5, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed">
          <BallCollider args={[0.1]} collisionGroups={0} />
        </RigidBody>
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} collisionGroups={0} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} collisionGroups={0} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} collisionGroups={0} />
        </RigidBody>

        <RigidBody position={[2, 1.74, 0]} ref={ring} {...segmentProps} >
          <CylinderCollider
            args={[0.05, 0.25]}
            rotation={[1.5708, 0, 0]}
            position={[0, -0.1, 0]}
            density={3}
          />
          <group scale={1.25}>
            <mesh
              geometry={nodes.RING.geometry}
              rotation={[0, 1.5708, 0]}
              material={materials.ringMat}
              material-roughness={0.2}
              metalness={1}
              material-color="red"
            />

            <mesh position={[0, 0.24, 0]}>
              <sphereGeometry args={[0.11, 10, 10]} />
              <meshBasicMaterial color="#FFEE00" />
            </mesh>

          </group>
        </RigidBody>

        <RigidBody
          position={[2, 1.16, 0]}
          ref={holder}
          {...segmentProps} >

          <CuboidCollider args={[0.12, 0.18, 0.05]} position={[0, -0.02, 0]} density={30} />

          <group scale={1.25}>
            <mesh
              geometry={nodes.CARDHOLDER.geometry}
              rotation={[0, 1.5708, 0]}
              material={materials.cardholderMat}
              material-roughness={0}
              metalness={1}
              material-color="blue"
            />
            <mesh
              geometry={nodes.SCREW.geometry}
              rotation={[0, 1.5708, 0]}
              position={[0, -0.138, 0]}
              material={materials.screwMat}
              material-roughness={0.5}
              metalness={1}
              material-color="white"
            />
          </group>
        </RigidBody>

        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.8, 1.12, 0.02]} position={[0, -0.23, 0]} />
          {/* <CuboidCollider args={[0.15, 0.15, 0.02]} position={[-0.65, 1.05, 0]} /> */}
          {/* <CuboidCollider args={[0.15, 0.15, 0.02]} position={[0.65, 1.05, 0]} /> */}

          <group scale={1.25} position={[0, -0.125, 0]} {...handlers}>
            <mesh geometry={nodes.CARD.geometry} rotation={[0, -1.5708, 0]}>
              <meshPhysicalMaterial map={materials.cardMat.map} roughness={0.1} metalness={0.5} />
            </mesh>
          </group>
        </RigidBody>
      </group>

      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="#FFEE00"
          depthTest={false}
          resolution={[width, height]}
          repeat={[-3, 1]}
          lineWidth={1}
        />
      </mesh>
    </>
  )
}
