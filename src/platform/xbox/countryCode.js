import {bootData} from './bridge';

// The region the console is set to, which the host reads from Windows.
export const getCountryCode = async () => bootData()?.country || null;
