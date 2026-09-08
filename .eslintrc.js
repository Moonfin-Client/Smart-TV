module.exports = {
	// Stops the cascade walking above the repo, where a contributor's own config would
	// change the result.
	root: true,
	globals: {
		tizen: 'readonly',
		webapis: 'readonly'
	}
};
