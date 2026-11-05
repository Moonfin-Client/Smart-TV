// Checks a new Silo password against the limits Silo published (GET /account/password/capability)
// before it's sent, so the common mistakes get a translated message instead of Silo's English one,
// as Moonfin Core does. Silo counts the minimum in characters and the maximum in UTF-8 bytes
// (bcrypt's 72 byte limit), and refuses the temporary password itself.

import $L from '@enact/i18n/$L';

// What Silo goes by when it doesn't say.
export const SILO_MIN_PASSWORD_LENGTH = 8;
export const SILO_MAX_PASSWORD_BYTES = 72;

const characters = (text) => Array.from(text).length;

// Older engines have no TextEncoder, and the URI escape counts the same UTF-8 bytes.
const utf8Bytes = (text) => (typeof TextEncoder === 'function'
	? new TextEncoder().encode(text).length
	: unescape(encodeURIComponent(text)).length);

/** Why the new password can't be sent as typed, or null when it can. */
export const siloNewPasswordIssue = ({newPassword, temporaryPassword, minimumLength, maximumBytes}) => {
	if (characters(newPassword) < (minimumLength || SILO_MIN_PASSWORD_LENGTH)) return 'tooShort';
	if (utf8Bytes(newPassword) > (maximumBytes || SILO_MAX_PASSWORD_BYTES)) return 'tooLong';
	if (temporaryPassword && newPassword === temporaryPassword) return 'sameAsTemporary';
	return null;
};

export const siloNewPasswordMessage = (issue, minimumLength) => {
	switch (issue) {
		case 'tooShort': return $L('Use at least {count} characters').replace('{count}', String(minimumLength || SILO_MIN_PASSWORD_LENGTH));
		case 'tooLong': return $L('That password is too long');
		case 'sameAsTemporary': return $L('Choose a password different from the temporary one');
		default: return null;
	}
};
