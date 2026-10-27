export interface ValidationResult {
  valid: boolean
  message?: string
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long.",
    }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least 1 number." }
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return {
      valid: false,
      message:
        "Password must contain at least 1 special character (e.g. !@#$%^&*).",
    }
  }
  return { valid: true }
}
