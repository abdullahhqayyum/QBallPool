import { useState, useCallback, useEffect } from 'react'

export const initialGameState = {
  mode:        'offline',
  myTurn:      true,
  myBalls:     [],        // 'solid' or 'stripe'
  myType:      null,      // 'solid' | 'stripe' | null (unassigned)
  pocketed:    [],        // all pocketed ball labels
  foul:        false,
  calledPocket: null,
  selectingPocket: false,
  winner:      null,
  gameId:      null,
  user:        null,
  cheatUsed:       false,   // ← NEW: has this player used their cheat
  cheatAvailable:  false,   // ← NEW: is the cheat button currently usable
}

export function useGameStore(initial = {}) {
  const [state, setState] = useState({ ...initialGameState, ...initial })

  useEffect(() => {
    // Register a subscriber so non-React code can notify React hooks
    const subscriber = (next) => setState(s => ({ ...s, ...next }))
    subscribers.add(subscriber)
    // Ensure GLOBAL_STATE contains the hook's initial values
    GLOBAL_STATE = { ...GLOBAL_STATE, ...state }
    return () => subscribers.delete(subscriber)
  }, [])

  const setTurn      = useCallback((v) => setState(s => ({ ...s, myTurn: v })), [])
  const setWinner    = useCallback((v) => setState(s => ({ ...s, winner: v })), [])
  const setFoul      = useCallback((v) => setState(s => ({ ...s, foul: v })), [])
  const setMyType    = useCallback((v) => setState(s => ({ ...s, myType: v })), [])
  const addPocketed  = useCallback((label) => setState(s => ({ ...s, pocketed: [...s.pocketed, label] })), [])
  const setCalledPocket = useCallback((pocketId) => setState(s => ({ ...s, calledPocket: pocketId })), [])
  const setSelectingPocket = useCallback((val) => setState(s => ({ ...s, selectingPocket: val })), [])

  return {
    state,
    setTurn,
    setWinner,
    setFoul,
    setMyType,
    addPocketed,
    setCalledPocket,
    setSelectingPocket,
    cheatUsed: state.cheatUsed,
    cheatAvailable: state.cheatAvailable,
  }
}

// Lightweight global accessors so non-React code (engine) can read/update
// the same store without needing React hooks. We attach helpers to the
// `useGameStore` function so existing imports continue to work.
let GLOBAL_STATE = { ...initialGameState }
const subscribers = new Set()

useGameStore.getState = () => GLOBAL_STATE
useGameStore.setCalledPocket = (pocketId) => {
  GLOBAL_STATE = { ...GLOBAL_STATE, calledPocket: pocketId }
  subscribers.forEach(s => s(GLOBAL_STATE))
}
useGameStore.setSelectingPocket = (val) => {
  GLOBAL_STATE = { ...GLOBAL_STATE, selectingPocket: val }
  subscribers.forEach(s => s(GLOBAL_STATE))
}

useGameStore.setCheatAvailable = (val) => {
  GLOBAL_STATE = { ...GLOBAL_STATE, cheatAvailable: val }
  subscribers.forEach(s => s(GLOBAL_STATE))
}

useGameStore.setCheatUsed = () => {
  GLOBAL_STATE = { ...GLOBAL_STATE, cheatUsed: true, cheatAvailable: false }
  subscribers.forEach(s => s(GLOBAL_STATE))
}

// Keep GLOBAL_STATE in sync when the hook is used to initialise
// (this is best-effort; React components should still use the hook)
export function _syncGlobalState(initial = {}) {
  GLOBAL_STATE = { ...GLOBAL_STATE, ...initial }
  subscribers.forEach(s => s(GLOBAL_STATE))
}