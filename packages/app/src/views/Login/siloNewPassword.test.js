import {siloNewPasswordIssue, siloNewPasswordMessage} from './siloNewPassword';

jest.mock('@enact/i18n/$L', () => (text) => text);

const check = (newPassword, limits = {}) => siloNewPasswordIssue({newPassword, temporaryPassword: 'temp-pass-1', minimumLength: 8, maximumBytes: 72, ...limits});

describe('a new Silo password', () => {
	it('passes when it fits the limits Silo gave', () => {
		expect(check('a-fine-password')).toBeNull();
	});

	it('counts the minimum in characters, so an accented word is as long as it looks', () => {
		expect(check('short')).toBe('tooShort');
		expect(check('éééééééé')).toBeNull();
	});

	it('counts the maximum in UTF-8 bytes, as bcrypt does', () => {
		expect(check('a'.repeat(72))).toBeNull();
		expect(check('é'.repeat(37))).toBe('tooLong');
	});

	it('refuses the temporary password itself', () => {
		expect(check('temp-pass-1')).toBe('sameAsTemporary');
	});

	it('falls back to Silo\'s own limits when it gave none', () => {
		expect(check('seven77', {minimumLength: 0, maximumBytes: 0})).toBe('tooShort');
		expect(siloNewPasswordMessage('tooShort', 0)).toBe('Use at least 8 characters');
	});
});
