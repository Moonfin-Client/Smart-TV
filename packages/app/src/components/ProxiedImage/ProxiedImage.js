import {useProxiedImage} from '../../hooks/useProxiedImage';

const ProxiedImage = ({src, alt, className, onError, ...rest}) => {
	const {imageUrl, loading} = useProxiedImage(src);

	if (loading || !imageUrl) {
		return null;
	}

	return (
		<img
			src={imageUrl}
			alt={alt}
			className={className}
			onError={onError}
			{...rest}
		/>
	);
};

export default ProxiedImage;
