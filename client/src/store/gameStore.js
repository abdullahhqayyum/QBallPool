import { useState, useCallback } from 'react'

export const initialGameState = {
  mode:        'offline',
  myTurn:      true,
  myBalls:     [],        // 'solid' or 'stripe'
  myType:      null,      // 'solid' | 'stripe' | null (unassigned)
  pocketed:    [],        // all pocketed ball labels
  foul:        false,
  winner:      null,
  gameId:      null,
  user:        null,
}

export function useGameStore(initial = {}) {
  const [state, setState] = useState({ ...initialGameState, ...initial })

  const setTurn      = useCallback((v) => setState(s => ({ ...s, myTurn: v })), [])
  const setWinner    = useCallback((v) => setState(s => ({ ...s, winner: v })), [])
  const setFoul      = useCallback((v) => setState(s => ({ ...s, foul: v })), [])
  const setMyType    = useCallback((v) => setState(s => ({ ...s, myType: v })), [])
  const addPocketed  = useCallback((label) => setState(s => ({ ...s, pocketed: [...s.pocketed, label] })), [])

  return { state, setTurn, setWinner, setFoul, setMyType, addPocketed }
}