import {useEffect} from 'react';

// A dialog over every panel keeps the focus while it's open. The panel underneath can still be loading when it opens
// (leaving a group's player goes back to Details or Home, which each focus their own first button once loaded), and
// focus taken by it would leave the remote driving a page the dialog covers.
const useHoldDialogFocus = (open, containerId, focusDefault) => {
	useEffect(() => {
		if (!open) return undefined;
		const handleFocusIn = (e) => {
			const container = document.querySelector(`[data-spotlight-id="${containerId}"]`);
			if (!container || container.contains(e.target)) return;
			focusDefault();
		};
		document.addEventListener('focusin', handleFocusIn);
		return () => document.removeEventListener('focusin', handleFocusIn);
	}, [open, containerId, focusDefault]);
};

export default useHoldDialogFocus;
