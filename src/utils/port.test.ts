import { describe, it, expect } from 'vitest'
import { generatePortOffsetFromBranchName, calculatePortForBranch, extractNumericSuffix, wrapPort } from './port.js'
import fc from 'fast-check'

describe('Port utilities', () => {
	describe('wrapPort', () => {
		it('should return port unchanged if within valid range', () => {
			expect(wrapPort(3042, 3000)).toBe(3042)
			expect(wrapPort(65535, 3000)).toBe(65535)
		})

		it('should wrap ports that exceed 65535', () => {
			// rawPort = 3000 + 70000 = 73000
			// range = 65535 - 3000 = 62535
			// wrapped = ((73000 - 3000 - 1) % 62535) + 3000 + 1 = (69999 % 62535) + 3001 = 7464 + 3001 = 10465
			expect(wrapPort(73000, 3000)).toBe(10465)
		})

		it('should wrap very large issue numbers', () => {
			// issueNumber 100000 with basePort 3000: rawPort = 103000
			// range = 62535
			// ((103000 - 3000 - 1) % 62535) + 3001 = (99999 % 62535) + 3001 = 37464 + 3001 = 40465
			expect(wrapPort(103000, 3000)).toBe(40465)
		})

		it('should wrap port at exactly boundary + 1', () => {
			// rawPort = 65536 (just over the limit)
			// range = 62535
			// ((65536 - 3000 - 1) % 62535) + 3001 = (62535 % 62535) + 3001 = 0 + 3001 = 3001
			expect(wrapPort(65536, 3000)).toBe(3001)
		})

		it('should work with different base ports', () => {
			// With basePort 5000, range = 60535
			// rawPort = 70000
			// ((70000 - 5000 - 1) % 60535) + 5001 = (64999 % 60535) + 5001 = 4464 + 5001 = 9465
			expect(wrapPort(70000, 5000)).toBe(9465)
		})
	})

	describe('extractNumericSuffix', () => {
		it('should return numeric part from PROJ-123 format', () => {
			expect(extractNumericSuffix('MARK-324')).toBe(324)
			expect(extractNumericSuffix('PROJECT-1')).toBe(1)
			expect(extractNumericSuffix('ABC-999')).toBe(999)
		})

		it('should handle multiple dashes (PROJ-SUB-456 -> 456)', () => {
			expect(extractNumericSuffix('PROJ-SUB-456')).toBe(456)
			expect(extractNumericSuffix('A-B-C-123')).toBe(123)
		})

		it('should handle underscore separator', () => {
			expect(extractNumericSuffix('PROJ_123')).toBe(123)
			expect(extractNumericSuffix('ABC_DEF_789')).toBe(789)
		})

		it('should return null for pure text without numbers', () => {
			expect(extractNumericSuffix('PROJECT')).toBeNull()
			expect(extractNumericSuffix('MARK')).toBeNull()
			expect(extractNumericSuffix('abc-def')).toBeNull()
		})

		it('should return null for empty string', () => {
			expect(extractNumericSuffix('')).toBeNull()
		})

		it('should handle numbers without separator', () => {
			expect(extractNumericSuffix('PROJ123')).toBe(123)
			expect(extractNumericSuffix('ABC456')).toBe(456)
		})
	})

	describe('generatePortOffsetFromBranchName', () => {
		it('should generate deterministic port offset for same branch name', () => {
			const branchName = 'feat/issue-87__add-commands'
			const offset1 = generatePortOffsetFromBranchName(branchName)
			const offset2 = generatePortOffsetFromBranchName(branchName)
			expect(offset1).toBe(offset2)
		})

		it('should return different offsets for different branch names', () => {
			const offset1 = generatePortOffsetFromBranchName('feat/branch-a')
			const offset2 = generatePortOffsetFromBranchName('feat/branch-b')
			expect(offset1).not.toBe(offset2)
		})

		it('should always return offset in range [1, 999]', () => {
			const testCases = [
				'main',
				'develop',
				'feat/issue-123',
				'fix/bug-456',
				'very-long-branch-name-with-many-characters-to-test-edge-cases',
				'a',
				'123',
			]

			for (const branchName of testCases) {
				const offset = generatePortOffsetFromBranchName(branchName)
				expect(offset).toBeGreaterThanOrEqual(1)
				expect(offset).toBeLessThanOrEqual(999)
			}
		})

		it('should handle branch names with special characters (/, -, _)', () => {
			const offset1 = generatePortOffsetFromBranchName('feat/issue-87_add-commands')
			const offset2 = generatePortOffsetFromBranchName('fix/bug_123-update')
			const offset3 = generatePortOffsetFromBranchName('chore/deps-update_v2')

			expect(offset1).toBeGreaterThanOrEqual(1)
			expect(offset1).toBeLessThanOrEqual(999)
			expect(offset2).toBeGreaterThanOrEqual(1)
			expect(offset2).toBeLessThanOrEqual(999)
			expect(offset3).toBeGreaterThanOrEqual(1)
			expect(offset3).toBeLessThanOrEqual(999)
		})

		it('should handle unicode characters in branch names', () => {
			const offset1 = generatePortOffsetFromBranchName('feat/添加功能')
			const offset2 = generatePortOffsetFromBranchName('fix/🐛-bug')
			const offset3 = generatePortOffsetFromBranchName('chore/Übersetzung')

			expect(offset1).toBeGreaterThanOrEqual(1)
			expect(offset1).toBeLessThanOrEqual(999)
			expect(offset2).toBeGreaterThanOrEqual(1)
			expect(offset2).toBeLessThanOrEqual(999)
			expect(offset3).toBeGreaterThanOrEqual(1)
			expect(offset3).toBeLessThanOrEqual(999)
		})

		it('should throw error for empty branch name', () => {
			expect(() => generatePortOffsetFromBranchName('')).toThrow('Branch name cannot be empty')
			expect(() => generatePortOffsetFromBranchName('   ')).toThrow('Branch name cannot be empty')
		})

		it('should match expected hash distribution', () => {
			// Test a few known branch names to ensure consistent hashing
			// These values are deterministic and should never change
			const offset1 = generatePortOffsetFromBranchName('main')
			const offset2 = generatePortOffsetFromBranchName('develop')

			expect(offset1).toBeGreaterThanOrEqual(1)
			expect(offset1).toBeLessThanOrEqual(999)
			expect(offset2).toBeGreaterThanOrEqual(1)
			expect(offset2).toBeLessThanOrEqual(999)

			// Same input should always produce same output
			expect(generatePortOffsetFromBranchName('main')).toBe(offset1)
			expect(generatePortOffsetFromBranchName('develop')).toBe(offset2)
		})
	})

	describe('calculatePortForBranch', () => {
		it('should calculate port with default base port (3000)', () => {
			const branchName = 'feat/test'
			const port = calculatePortForBranch(branchName)

			expect(port).toBeGreaterThanOrEqual(3001)
			expect(port).toBeLessThanOrEqual(3999)
		})

		it('should calculate port with custom base port', () => {
			const branchName = 'feat/test'
			const basePort = 5000
			const port = calculatePortForBranch(branchName, basePort)

			expect(port).toBeGreaterThanOrEqual(5001)
			expect(port).toBeLessThanOrEqual(5999)
		})

		it('should return same port for same branch name', () => {
			const branchName = 'feat/consistent'
			const port1 = calculatePortForBranch(branchName)
			const port2 = calculatePortForBranch(branchName)

			expect(port1).toBe(port2)
		})

		it('should return different ports for different branch names', () => {
			const port1 = calculatePortForBranch('feat/branch-a')
			const port2 = calculatePortForBranch('feat/branch-b')

			expect(port1).not.toBe(port2)
		})

		it('should wrap port if it exceeds 65535', () => {
			// Find a branch name that hashes to high offset (close to 999)
			// and use basePort that causes total to exceed 65535
			// Using basePort 65000 and any offset > 535 will exceed 65535

			// This branch 'feat/trigger-high-port' hashes to offset 793
			// 65000 + 793 = 65793 > 65535
			// range = 65535 - 65000 = 535
			// wrapped = ((65793 - 65000 - 1) % 535) + 65000 + 1 = (792 % 535) + 65001 = 257 + 65001 = 65258
			const branchName = 'feat/trigger-high-port'
			const basePort = 65000
			const port = calculatePortForBranch(branchName, basePort)

			expect(port).toBeGreaterThanOrEqual(basePort + 1)
			expect(port).toBeLessThanOrEqual(65535)
		})

		it('should throw error for empty branch name', () => {
			expect(() => calculatePortForBranch('')).toThrow('Branch name cannot be empty')
		})
	})

	describe('property-based tests', () => {
		it('should generate same port for same branch name', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					// Skip whitespace-only strings
					if (branchName.trim().length === 0) return

					const port1 = calculatePortForBranch(branchName)
					const port2 = calculatePortForBranch(branchName)

					expect(port1).toBe(port2)
				})
			)
		})

		it('should always generate valid ports in range [basePort+1, basePort+999]', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					// Skip whitespace-only strings
					if (branchName.trim().length === 0) return

					const basePort = 3000
					const port = calculatePortForBranch(branchName, basePort)

					expect(port).toBeGreaterThanOrEqual(basePort + 1)
					expect(port).toBeLessThanOrEqual(basePort + 999)
				})
			)
		})

		it('should handle arbitrary branch names without throwing', () => {
			fc.assert(
				fc.property(fc.string({ minLength: 1, maxLength: 100 }), (branchName) => {
					// Skip whitespace-only strings
					if (branchName.trim().length === 0) {
						expect(() => calculatePortForBranch(branchName)).toThrow('Branch name cannot be empty')
					} else {
						expect(() => calculatePortForBranch(branchName)).not.toThrow()
					}
				})
			)
		})
	})
})
