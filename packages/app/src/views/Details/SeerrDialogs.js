import {CancelRequestPopup} from '../../components/seerr/CancelRequestPopup';
import {ManageRequestsPopup} from '../../components/seerr/ManageRequestsPopup';
import {ReportIssuePopup} from '../../components/seerr/ReportIssuePopup';
import SeerrRequestDialog from '../../components/seerr/SeerrRequestDialog';

// The popups the Seerr actions raise. They all run off the overlay, so a screen with no Seerr
// side renders nothing at all here.
const SeerrDialogs = ({seerr, item}) => {
	if (!seerr.isActive) return null;

	const isTv = seerr.mediaType === 'tv';
	const isEpisode = item?.Type === 'Episode';
	const isSeason = item?.Type === 'Season';
	// A season or episode page asks about its series
	const title = (isEpisode || isSeason) && item.SeriesName ? item.SeriesName : item?.Name;
	let reportSeason = null;
	if (isEpisode) reportSeason = item.ParentIndexNumber;
	else if (isSeason) reportSeason = item.IndexNumber;

	return (
		<>
			{seerr.requestDialog && (
				<SeerrRequestDialog
					is4k={seerr.requestDialog.is4k}
					qualityToggle={seerr.requestDialog.qualityToggle}
					season={seerr.requestDialog.season}
					details={seerr.sheetDetails}
					isTv={isTv}
					isContinuing={seerr.isContinuing}
					activeRequests={seerr.activeRequests}
					quota={isTv ? seerr.quota?.tv : seerr.quota?.movie}
					canRequestAdvanced={seerr.hasAdvanced}
					servers={seerr.servers}
					onSubmit={seerr.handleSubmitRequest}
					onClose={seerr.handleCloseRequestDialog}
				/>
			)}

			{seerr.showsReportIssue && (
				<ReportIssuePopup
					open={seerr.showReportPopup}
					isTv={isTv}
					seasons={seerr.sheetDetails?.seasons}
					numberOfSeasons={seerr.sheetDetails?.numberOfSeasons}
					initialSeason={reportSeason}
					initialEpisode={isEpisode ? item.IndexNumber : null}
					onSubmit={seerr.handleReportSubmit}
					onClose={seerr.handleCloseReportPopup}
				/>
			)}

			<CancelRequestPopup
				open={seerr.showCancelPopup}
				requests={seerr.cancelTargets}
				title={title}
				onConfirm={seerr.handleCancelConfirm}
				onClose={seerr.handleCloseCancelPopup}
			/>

			{seerr.showsManage && (
				<ManageRequestsPopup
					open={seerr.showManagePopup}
					pendingRequests={seerr.pendingRequests}
					onResolve={seerr.handleResolveRequest}
					onClose={seerr.handleCloseManagePopup}
				/>
			)}
		</>
	);
};

export default SeerrDialogs;
