import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { EnvironmentManager } from './EnvironmentManager.js'
import { validateEnvVariable, isValidEnvKey } from '../utils/env.js'

describe('EnvironmentManager property tests', () => {
  let manager: EnvironmentManager

  beforeEach(() => {
    manager = new EnvironmentManager()
  })

  describe('calculatePort properties', () => {
    it('should always return valid port numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9999 }),
          fc.integer({ min: 1000, max: 60000 }),
          (issueNumber, basePort) => {
            try {
              const port = manager.calculatePort({ issueNumber, basePort })

              // Port should always be in valid range
              expect(port).toBeGreaterThanOrEqual(1)
              expect(port).toBeLessThanOrEqual(65535)

              // Port should equal basePort + issueNumber
              expect(port).toBe(basePort + issueNumber)
            } catch (error) {
              // If it throws, it should be because the port exceeds the max
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toContain('exceeds maximum')
              expect(basePort + issueNumber).toBeGreaterThan(65535)
            }
          }
        )
      )
    })

    it('should never have collisions for different issues with same base port', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1000, max: 3000 }),
          (issue1, issue2, basePort) => {
            fc.pre(issue1 !== issue2) // Only test different issue numbers

            const port1 = manager.calculatePort({
              issueNumber: issue1,
              basePort,
            })
            const port2 = manager.calculatePort({
              issueNumber: issue2,
              basePort,
            })

            // Different issues should always produce different ports
            expect(port1).not.toBe(port2)
          }
        )
      )
    })

    it('should use issueNumber over prNumber when both provided', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (issueNumber, prNumber) => {
            fc.pre(issueNumber !== prNumber)

            const port = manager.calculatePort({ issueNumber, prNumber })
            const expectedPort = 3000 + issueNumber

            expect(port).toBe(expectedPort)
          }
        )
      )
    })

    it('should handle edge case of zero offset', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1000, max: 65535 }), (basePort) => {
          const port = manager.calculatePort({ basePort })

          expect(port).toBe(basePort)
        })
      )
    })
  })

  describe('validation properties', () => {
    it('should correctly identify valid/invalid variable names', () => {
      fc.assert(
        fc.property(fc.string(), (name) => {
          const result = isValidEnvKey(name)
          const validation = validateEnvVariable(name)

          // If name is valid, validation should succeed
          if (result) {
            expect(validation.valid).toBe(true)
          } else {
            expect(validation.valid).toBe(false)
            expect(validation.error).toBeDefined()
          }
        })
      )
    })

    it('should accept valid variable names matching pattern', () => {
      const validKeyArbitrary = fc
        .tuple(
          fc.constantFrom('_', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')),
          fc.array(
            fc.constantFrom('_', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')),
            { minLength: 0, maxLength: 50 }
          )
        )
        .map(([first, rest]) => first + rest.join(''))

      fc.assert(
        fc.property(validKeyArbitrary, (key) => {
          const result = isValidEnvKey(key)
          expect(result).toBe(true)

          const validation = validateEnvVariable(key)
          expect(validation.valid).toBe(true)
        })
      )
    })

    it('should accept any string value for valid keys', () => {
      const validKeyArbitrary = fc
        .tuple(
          fc.constantFrom('_', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ')),
          fc.array(
            fc.constantFrom('_', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')),
            { minLength: 0, maxLength: 20 }
          )
        )
        .map(([first, rest]) => first + rest.join(''))

      fc.assert(
        fc.property(validKeyArbitrary, fc.string(), (key, value) => {
          const validation = validateEnvVariable(key, value)
          expect(validation.valid).toBe(true)
        })
      )
    })
  })

  describe('port calculation invariants', () => {
    it('should maintain ordering: smaller issue numbers produce smaller ports', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 1, max: 500 }),
          (issue1, issue2) => {
            fc.pre(issue1 !== issue2)

            const port1 = manager.calculatePort({ issueNumber: issue1 })
            const port2 = manager.calculatePort({ issueNumber: issue2 })

            if (issue1 < issue2) {
              expect(port1).toBeLessThan(port2)
            } else {
              expect(port1).toBeGreaterThan(port2)
            }
          }
        )
      )
    })

    it('should be deterministic: same inputs produce same output', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1000, max: 60000 }),
          (issueNumber, basePort) => {
            const port1 = manager.calculatePort({ issueNumber, basePort })
            const port2 = manager.calculatePort({ issueNumber, basePort })

            expect(port1).toBe(port2)
          }
        )
      )
    })
  })
})
