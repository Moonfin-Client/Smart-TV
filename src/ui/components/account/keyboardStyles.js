import $L from '../../../services/i18n.js';

export const getKeyboardStyleOptions = () => [
	{ value: 'native', label: $L('Native') },
	{ value: 'classic', label: $L('Classic') },
	{ value: 'glass', label: $L('Glass') },
	{ value: 'docked', label: $L('Docked') }
];
