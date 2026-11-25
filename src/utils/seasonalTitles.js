import $L from '../services/i18n.js';

// Moonbase names the holiday by id, so the row title is built here on every draw.
export const seasonalTitle = (holiday) => {
	switch (holiday) {
		case 'newYear': return $L("New Year's");
		case 'valentines': return $L("Valentine's Day");
		case 'easter': return $L('Easter');
		case 'pride': return $L('Pride');
		case 'halloween': return $L('Halloween');
		case 'thanksgiving': return $L('Thanksgiving');
		case 'christmas': return $L('Christmas Movies');
		case 'lunarNewYear': return $L('Lunar New Year');
		case 'diwali': return $L('Diwali');
		default: return $L('Seasonal Row');
	}
};

export const seasonalCountryLabel = (code) => {
	switch (code) {
		case 'auto': return $L('Automatic');
		case 'US': return $L('United States');
		case 'CA': return $L('Canada');
		case 'other': return $L('Other');
		default: return code;
	}
};
