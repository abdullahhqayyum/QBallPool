// Sanity-check shot inputs before broadcasting
function validateShot(angle, power) {
  if (typeof angle !== 'number' || typeof power !== 'number') return false
  if (isNaN(angle) || isNaN(power))                          return false
  if (power < 0 || power > 30)                               return false // matches CUE.maxPower
  return true
}

module.exports = { validateShot }
