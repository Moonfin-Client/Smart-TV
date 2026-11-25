import {bootData} from './bridge';

export const getCountryCode = async () => bootData()?.country || null;
