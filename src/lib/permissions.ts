import type { AppRole } from '../types'

export const isOwner = (role?: AppRole | null) => role === 'owner'
export const isOfficer = (role?: AppRole | null) => role === 'owner' || role === 'officer'
export const canManageBankWatch = isOfficer
export const canManageOrders = isOfficer
export const canAssignRoles = isOwner
