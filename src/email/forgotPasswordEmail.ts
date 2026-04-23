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

      // Segoe UI first so Outlook uses it (installed with Windows since Vista)
      // instead of falling through to MS PGothic. Apple Mail / Gmail pick the
      // next available from the stack.
      const font = `font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;`

      return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;color:#1a1a1a;${font}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;padding:40px 20px;${font}">
      <tr>
        <td align="center" style="${font}">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);${font}">
            <tr>
              <td style="padding:40px 40px 24px;${font}">
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;${font}">${title}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#333333;${font}">${intro}</p>
                <p style="margin:0 0 28px;font-size:17px;line-height:1.6;${font}">
                  <a href="${link}" style="font-weight:700;color:#1a1a1a;text-decoration:none;${font}">${buttonText} &rarr;</a>
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#666666;${font}">Or copy and paste this URL into your browser:</p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#666666;word-break:break-all;${font}"><a href="${link}" style="color:#666666;text-decoration:none;${font}">${link}</a></p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#888888;${font}">${expiryNote}</p>
                <p style="margin:0 0 ${supportNote ? '8px' : '0'};font-size:14px;line-height:1.6;color:#888888;${font}">${ignoreNote}</p>
                ${supportNote ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#888888;${font}">${supportNote}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px;background:#f9f9fb;border-top:1px solid #eeeeee;${font}">
                <p style="margin:0;font-size:13px;color:#999999;${font}">${projectName}</p>
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
