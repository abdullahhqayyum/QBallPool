import { useGameStore } from "../store/gameStore"

export default function PocketCallModal() {
  const selectingPocket = useGameStore((s) => s.selectingPocket)

  if (!selectingPocket) return null

  return (
    <div style={{
      position: "absolute",
      top: 20,
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.7)",
      color: "white",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      pointerEvents: "none"
    }}>
      Tap a red pocket to call it for the 8-ball
    </div>
  )
}