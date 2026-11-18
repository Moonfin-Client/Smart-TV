import $L from '@enact/i18n/$L';

export const getKeyboardStyleOptions = () => [
	{ value: 'native', label: $L('Native') },
	{ value: 'classic', label: $L('Classic') },
	{ value: 'glass', label: $L('Glass') },
	{ value: 'docked', label: $L('Docked') }
];
