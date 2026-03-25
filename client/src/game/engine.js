// Minimal stub for the game engine API so builds succeed.
// NOTE: This is a temporary placeholder. Replace with the full
// engine implementation (Phaser scene setup) for proper gameplay.

function createRegistry() {
	const data = new Map()
	return {
		get: (k) => data.get(k),
		set: (k, v) => data.set(k, v),
	}
}

export function initEngine(containerId, gameState, onResult, onStateUpdate, onPocket) {
	// Create a minimal mock scene/registry structure expected by the UI.
	const registry = createRegistry()
	// sensible defaults used by the UI
	registry.set('myTurn', true)
	registry.set('balls', [])

	const mockScene = {
		registry,
		events: { once: () => {} },
		// minimal game canvas placeholder
		game: { canvas: { style: {} } },
	}

	const engine = {
		scene: { scenes: [mockScene] },
	}

	// Expose a tiny API so destroyEngine can accept this object.
	return engine
}

export function destroyEngine(/* engine */) {
	// no-op for stub
}

export default { initEngine, destroyEngine }

