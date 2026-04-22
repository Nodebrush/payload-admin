export interface ForgotPasswordEmailOptions {
  /** Project display name — e.g. 'ECSA CMS' */
  projectName: string
  /** Base URL of the admin app — e.g. 'https://admin.ecsa-customs.com' */
  adminUrl: string
}

type ForgotPasswordArgs = {
  req?: unknown
  token?: string
  user?: { email?: string; isInvite?: boolean } & Record<string, unknown>
} | undefined

/**
 * Returns auth.forgotPassword config (subject + HTML generators) that renders
 * branded emails for both password resets and invitations.
 *
 * Invitations piggy-back on Payload's forgotPassword flow: when we create a
 * user and immediately trigger forgotPassword, the resulting email is the
 * invite email. We distinguish by checking the user's `isInvite` flag, which
 * the invite endpoint sets on user creation and we clear on first reset.
 *
 * Spread the result onto the Users collection's `auth.forgotPassword` field.
 */
export function forgotPasswordEmail(options: ForgotPasswordEmailOptions) {
  const { projectName, adminUrl } = options
  const base = adminUrl.replace(/\/$/, '')

  return {
    generateEmailSubject: (args: ForgotPasswordArgs) => {
      if (args?.user?.isInvite) return `You've been invited to ${projectName}`
      return `Reset your ${projectName} password`
    },
    generateEmailHTML: (args: ForgotPasswordArgs) => {
      const token = args?.token
      const user = args?.user
      const link = `${base}/admin/reset/${token}`
      const isInvite = Boolean(user?.isInvite)

      const title = isInvite ? `Welcome to ${projectName}` : `Reset your password`
      const intro = isInvite
        ? `You've been invited to ${projectName}. Click the button below to set your password and sign in.`
        : `Someone (hopefully you) requested a password reset for your ${projectName} account. Click the button below to choose a new password.`
      const buttonText = isInvite ? 'Set your password' : 'Reset password'
      const expiryNote = isInvite
        ? 'This invitation link expires in 7 days.'
        : 'This link expires in 1 hour.'
      const ignoreNote = isInvite
        ? `If you weren't expecting this invitation, you can safely ignore this email.`
        : `If you didn't request this, you can safely ignore this email — your password won't change.`
      const supportNote = isInvite
        ? `If you run into any issues, just reply to this email and we'll help you out.`
        : ''

      return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <tr>
              <td style="padding:40px 40px 24px;">
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">${title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333333;">${intro}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#1a1a1a;border-radius:6px;">
                      <a href="${link}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${buttonText}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#666666;">Or copy and paste this URL into your browser:</p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#666666;word-break:break-all;"><a href="${link}" style="color:#666666;text-decoration:underline;">${link}</a></p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#888888;">${expiryNote}</p>
                <p style="margin:0 0 ${supportNote ? '8px' : '0'};font-size:13px;line-height:1.6;color:#888888;">${ignoreNote}</p>
                ${supportNote ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#888888;">${supportNote}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px;background:#f9f9fb;border-top:1px solid #eeeeee;">
                <p style="margin:0;font-size:12px;color:#999999;">${projectName}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
    },
  }
}
