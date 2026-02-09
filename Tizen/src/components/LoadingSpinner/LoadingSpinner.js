import Spinner from '@enact/sandstone/Spinner';
import css from './LoadingSpinner.module.less';

const LoadingSpinner = ({message}) => (
	<div className={css.container}>
		<Spinner />
		{message && <div className={css.message}>{message}</div>}
	</div>
);

export default LoadingSpinner;
