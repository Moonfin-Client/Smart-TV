import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import * as achievementsApi from '../../../services/achievementsApi';
import {
	BADGE_FILTERS, groupBadges, leaderboardValue, parseHexColor, rarityColor,
	REROLLED, REROLL_FAILED, POWER_UP_USED, PURCHASE_BOUGHT, statsAreEmpty,
	COSMETIC_AVATAR, COSMETIC_RANK_TITLE, COSMETIC_CHANGED,
	cosmeticsOf, equippedCosmetic, ownsCosmetic, wornAvatarIcon, wornTitle, cosmeticsAreEmpty,
	wearingCosmetic, boughtCosmetic
} from '../../../utils/achievementsModel';
import {relativeTimeLabel} from '../../../utils/relativeTime';
import {achievementIconPath} from './achievementIcons';
import ConfirmSpendDialog from './ConfirmSpendDialog';
import DetailsTabBar from '../../../components/DetailsTabBar/DetailsTabBar';
import SettingsView from '../SettingsView';
import useSurfaceAccent from '../../../hooks/useSurfaceAccent';
import {renderSettingsIcon} from '../settingsIcons';
import {SectionTitle, NavRow} from '../settingsRows';
import {SpottableDiv} from '../settingsSpottables';

import settingsCss from '../Settings.module.less';
import css from './Achievements.module.less';

const DEFAULT_ACCENT = '#00a4dc';

// The plugin has no category name for the overall board, but a tab still needs an id of its own.
const OVERALL_BOARD = 'score';
const BOARDS = [OVERALL_BOARD, 'movies', 'episodes', 'hours', 'streak', 'series', 'unlocked'];
const PERIODS = ['week', 'month', 'year'];

const tint = (hex, alpha = 0.18) => {
	const value = parseHexColor(hex) || DEFAULT_ACCENT;
	const n = parseInt(value.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// The fill and outline a settings icon shell wears, in whatever colour the badge carries.
const shell = (color) => ({background: tint(color), borderColor: tint(color, 0.45), color});

const percent = (value) => `${Math.round(value * 100)}%`;

const mediumDate = (date) =>
	date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});

const Icon = ({name, className}) => (
	<svg className={className} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
		<path d={achievementIconPath(name)} />
	</svg>
);

const Bar = ({value, color, slim}) => (
	<div className={`${css.bar}${slim ? ` ${css.barSlim}` : ''}`}>
		<div className={css.barFill} style={{width: percent(value), background: color}} />
	</div>
);

const Chip = ({icon, label}) => (
	<div className={css.chip}>
		<Icon name={icon} className={css.chipIcon} />
		<span>{label}</span>
	</div>
);

// The same bar the search results use, so a tab reads and behaves the same wherever it appears.
// Only the bars that switch a list already loaded follow focus. The ones that fetch would leave
// the bar and the rows disagreeing while an answer was still out.
const Tabs = ({ids, labels, activeId, onSelect, spotlightId, expanded = false}) => (
	<DetailsTabBar
		className={css.tabs}
		tabs={ids.map((id, index) => ({id, label: labels[index]}))}
		activeId={activeId}
		activeSpotlightId={`${spotlightId}-active`}
		onSelect={onSelect}
		onActivate={onSelect}
		expanded={expanded}
		spotlightId={spotlightId}
	/>
);

// One row that opens one of the screens below this one, so the handler belongs to the row rather
// than being rebuilt for every row on every render.
const OpenScreenRow = ({id, title, desc, icon, view, onOpen, enabled = true}) => {
	const handleClick = useCallback(() => onOpen(view, `setting-${id}`), [onOpen, view, id]);
	return <NavRow id={id} title={title} desc={desc} icon={icon} onClick={enabled ? handleClick : null} />;
};

const Message = ({children}) => <div className={css.message}>{children}</div>;

// What a screen shows when the plugin answered it with nothing.
const LoadFailed = ({spotlightId, onRetry}) => (
	<>
		<Message>{$L('Could not load your achievements.')}</Message>
		<div className={css.retryRow}>
			<SpottableDiv className={css.retryButton} spotlightId={spotlightId} onClick={onRetry}>
				{$L('Retry')}
			</SpottableDiv>
		</div>
	</>
);

// Every screen here reads once when it opens and shows the loading message until the answer
// lands. read has to be a stable callback, since a new one means the screen is showing something
// else and asks again.
export const useLoadOnOpen = (read) => {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		read().then((next) => {
			if (cancelled) return;
			setData(next);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [read, attempt]);

	const reload = useCallback(() => setAttempt((n) => n + 1), []);
	return {data, setData, loading, reload};
};

// A row takes focus even when it does nothing, because a list whose rows cannot be focused is a
// list the remote cannot scroll.
const AchievementRow = ({spotlightId, onClick, children}) => (
	<SpottableDiv className={settingsCss.listItem} spotlightId={spotlightId} onClick={onClick}>
		{children}
	</SpottableDiv>
);

// The rounded shell every row in this panel leads with.
const TileIcon = ({icon, color, dimmed}) => (
	<div className={`${css.badgeAvatar}${dimmed ? ` ${css.badgeAvatarLocked}` : ''}`} style={shell(color)}>
		<Icon name={icon} className={css.badgeIcon} />
	</div>
);

// The score a user still has to spend, above whatever it can be spent on.
const ScoreBank = ({bank}) => (
	<>
		<SectionTitle>{$L('Score bank')}</SectionTitle>
		<div className={css.progressBlock}>
			<div className={css.progressFigure}>
				{$L('{score} points').replace('{score}', String(bank))}
			</div>
		</div>
	</>
);

// The plugin sends English names for its three power-ups, so the panel words them itself and falls
// back to the raw type if a fourth ever turns up.
const POWER_UP_TEXT = {
	XpBoost: {
		name: () => $L('XP Boost'),
		body: () => $L('Doubles score for an hour. Using it again restarts the hour.')
	},
	DoubleCredit: {
		name: () => $L('Double Credit'),
		body: () => $L('The next thing you finish counts twice towards badges.')
	},
	StreakFreeze: {
		name: () => $L('Streak Freeze'),
		body: () => $L('Covers one missed day. Only one can be banked.')
	}
};

const powerUpName = (type) => (POWER_UP_TEXT[type] ? POWER_UP_TEXT[type].name() : type);
const powerUpBody = (type) => (POWER_UP_TEXT[type] ? POWER_UP_TEXT[type].body() : '');

const BadgeRow = ({badge, onOpenBadge}) => {
	const color = rarityColor(badge.rarity);
	const showsProgress = !badge.unlocked && badge.targetValue > 0;
	const handleClick = useCallback(() => onOpenBadge(badge.id), [onOpenBadge, badge.id]);

	return (
		<AchievementRow spotlightId={`achievement-badge-${badge.id}`} onClick={handleClick}>
			<TileIcon icon={badge.icon} color={color} dimmed={!badge.unlocked} />
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>
					{badge.isSecret ? $L('Hidden achievement') : badge.title}
				</div>
				{badge.description && !badge.descriptionHidden && (
					<div className={settingsCss.listItemCaption}>{badge.description}</div>
				)}
				{showsProgress && (
					<>
						<div className={css.rowBar}><Bar value={badge.progress} color={color} slim /></div>
						<div className={css.progressText}>{`${badge.currentValue} / ${badge.targetValue}`}</div>
					</>
				)}
				{badge.unlocked && badge.unlockedAt && (
					<div className={css.progressText}>
						{$L('Unlocked {date}').replace('{date}', mediumDate(badge.unlockedAt))}
					</div>
				)}
			</div>
			<div className={css.trailingStack}>
				<div className={css.rarity} style={{color}}>{badge.rarity}</div>
				<div className={css.points}>{$L('{points} pts').replace('{points}', String(badge.score))}</div>
			</div>
		</AchievementRow>
	);
};

const CategorySection = ({group, open, onToggle, onOpenBadge}) => {
	const handleToggle = useCallback(() => onToggle(group.category), [onToggle, group.category]);

	return (
		<>
			<NavRow
				id={`achievement-category-${group.category}`}
				title={group.category}
				desc={$L('{unlocked} of {total} badges')
					.replace('{unlocked}', String(group.unlocked))
					.replace('{total}', String(group.badges.length))}
				icon={open ? 'folder_open' : 'folder'}
				onClick={handleToggle}
			/>
			{open && group.badges.map((badge) => (
				<BadgeRow key={badge.id} badge={badge} onOpenBadge={onOpenBadge} />
			))}
		</>
	);
};

const RankHeader = ({rank, summary, worn}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	const color = (rank && parseHexColor(rank.tier.color)) || accent;
	const avatar = wornAvatarIcon(worn);
	const title = wornTitle(worn);

	return (
		<div className={css.rankHeader}>
			{rank && (
				<>
					<div className={css.rankRow}>
						<div className={css.rankAvatar} style={shell(color)}>
							<Icon name={avatar || rank.tier.icon} className={css.rankAvatarIcon} />
						</div>
						<div>
							<div className={css.rankName}>{title || rank.tier.name}</div>
							<div className={css.rankScore}>
								{$L('{score} points').replace('{score}', String(rank.score))}
							</div>
						</div>
					</div>
					<Bar value={rank.progressToNext / 100} color={color} />
					<div className={css.rankNote}>
						{rank.nextTier
							? $L('{points} points to {tier}')
								.replace('{points}', String(Math.max(0, rank.nextTier.minScore - rank.score)))
								.replace('{tier}', rank.nextTier.name)
							: $L('Top rank reached')}
					</div>
				</>
			)}
			{summary && (
				<div className={css.chips} style={rank ? {marginTop: '20px'} : null}>
					<Chip
						icon="military_tech"
						label={$L('{unlocked} of {total} badges')
							.replace('{unlocked}', String(summary.unlocked))
							.replace('{total}', String(summary.total))}
					/>
					<Chip icon="percent" label={`${summary.percentage.toFixed(1)}%`} />
					<Chip
						icon="local_fire_department"
						label={$L('{days} day streak').replace('{days}', String(summary.currentWatchStreak))}
					/>
					<Chip
						icon="emoji_events"
						label={$L('Best: {days} days').replace('{days}', String(summary.bestWatchStreak))}
					/>
				</div>
			)}
		</div>
	);
};

// Each badge takes focus so the remote can reach the ones past the right edge.
const Showcase = ({badges}) => (
	<>
		<SectionTitle>{$L('Showcase')}</SectionTitle>
		<div className={css.showcase}>
			{badges.map((badge) => {
				const color = rarityColor(badge.rarity);
				return (
					<SpottableDiv
						key={badge.id}
						className={css.showcaseItem}
						spotlightId={`achievement-showcase-${badge.id}`}
					>
						<div className={css.showcaseAvatar} style={shell(color)}>
							<Icon name={badge.icon} className={css.showcaseIcon} />
						</div>
						<div className={css.showcaseTitle}>{badge.title}</div>
					</SpottableDiv>
				);
			})}
		</div>
	</>
);

export const AchievementsView = ({overview, loading, onReload, onOpen}) => {
	if (loading) return <SettingsView spotlightId="achievements-view"><Message>{$L('Loading...')}</Message></SettingsView>;

	if (!overview) {
		return (
			<SettingsView spotlightId="achievements-view">
				<LoadFailed spotlightId="achievements-retry" onRetry={onReload} />
			</SettingsView>
		);
	}

	const unlocked = overview.badges.filter((badge) => badge.unlocked).length;
	const questCount = overview.quests
		? [...overview.quests.daily, ...overview.quests.weekly].filter((quest) => quest.completed).length
		: 0;
	const libraries = Object.keys(overview.libraryCompletion);

	return (
		<SettingsView spotlightId="achievements-view">
			<RankHeader rank={overview.rank} summary={overview.summary} worn={overview.cosmetics} />
			{overview.equipped.length > 0 && <Showcase badges={overview.equipped} />}
			<OpenScreenRow
				id="achievements-badges"
				title={$L('Badges')}
				desc={$L('{unlocked} of {total} badges')
					.replace('{unlocked}', String(unlocked))
					.replace('{total}', String(overview.badges.length))}
				icon="military_tech"
				view="achievementsBadges"
				onOpen={onOpen}
				enabled={overview.badges.length > 0}
			/>
			{overview.questsEnabled && overview.quests && !overview.quests.isEmpty && (
				<OpenScreenRow
					id="achievements-quests"
					title={$L('Quests')}
					desc={$L('{count} completed').replace('{count}', String(questCount))}
					icon="task_alt"
					view="achievementsQuests"
					onOpen={onOpen}
				/>
			)}
			{overview.activityEnabled && (
				<OpenScreenRow
					id="achievements-activity"
					title={$L('Activity')}
					desc={$L('What the server has unlocked lately')}
					icon="bolt"
					view="achievementsActivity"
					onOpen={onOpen}
				/>
			)}
			{overview.leaderboardEnabled && (
				<OpenScreenRow
					id="achievements-leaderboard"
					title={$L('Leaderboard')}
					desc={$L('How you compare with other users on this server')}
					icon="leaderboard"
					view="achievementsLeaderboard"
					onOpen={onOpen}
				/>
			)}
			<OpenScreenRow
				id="achievements-stats"
				title={$L('Stats')}
				desc={$L('Your records and how the server is doing')}
				icon="bar_chart"
				view="achievementsStats"
				onOpen={onOpen}
			/>
			<OpenScreenRow
				id="achievements-recap"
				title={$L('Recap')}
				desc={$L('What you watched recently')}
				icon="insights"
				view="achievementsRecap"
				onOpen={onOpen}
			/>
			<OpenScreenRow
				id="achievements-loadout"
				title={$L('Loadout')}
				desc={$L('Score to spend and the boosts you hold')}
				icon="backpack"
				view="achievementsLoadout"
				onOpen={onOpen}
			/>
			{overview.cosmetics && !cosmeticsAreEmpty(overview.cosmetics) && (
				<OpenScreenRow
					id="achievements-appearance"
					title={$L('Appearance')}
					desc={$L('The avatar and title on your profile')}
					icon="face_5"
					view="achievementsAppearance"
					onOpen={onOpen}
				/>
			)}
			{libraries.length > 0 && (
				<OpenScreenRow
					id="achievements-libraries"
					title={$L('Library completion')}
					desc={$L('{count} libraries').replace('{count}', String(libraries.length))}
					icon="collections_bookmark"
					view="achievementsLibrary"
					onOpen={onOpen}
				/>
			)}
		</SettingsView>
	);
};

export const AchievementsBadgesView = ({badges, onOpenBadge}) => {
	const [filter, setFilter] = useState(BADGE_FILTERS[0]);
	const [open, setOpen] = useState([]);

	const groups = useMemo(
		() => groupBadges(badges, filter, $L('Other')),
		[badges, filter]
	);

	const toggle = useCallback((category) => {
		setOpen((prev) => (prev.includes(category)
			? prev.filter((name) => name !== category)
			: [...prev, category]));
	}, []);

	return (
		<SettingsView spotlightId="achievements-badges-view">
			<Tabs
				ids={BADGE_FILTERS}
				labels={[$L('All'), $L('Unlocked'), $L('Locked')]}
				activeId={filter}
				onSelect={setFilter}
				spotlightId="achievement-filter"
				expanded
			/>
			{groups.length === 0
				? <Message>{$L('Nothing here yet.')}</Message>
				: groups.map((group) => (
					<CategorySection
						key={group.category}
						group={group}
						open={open.includes(group.category)}
						onToggle={toggle}
						onOpenBadge={onOpenBadge}
					/>
				))}
		</SettingsView>
	);
};

const ChaseRow = ({item, onSelectItem}) => {
	// Details fetches the full record by id, so the seed only has to say which item this was.
	const handleClick = useCallback(
		() => onSelectItem({Id: item.id, Name: item.name, Type: item.type}),
		[onSelectItem, item.id, item.name, item.type]
	);
	const parts = [
		item.type,
		item.year > 0 ? String(item.year) : '',
		item.runtimeMinutes > 0 ? $L('{minutes} min').replace('{minutes}', String(item.runtimeMinutes)) : ''
	].filter(Boolean);

	return (
		<AchievementRow spotlightId={`achievement-chase-${item.id}`} onClick={handleClick}>
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>{item.name}</div>
				{parts.length > 0 && <div className={settingsCss.listItemCaption}>{parts.join(' \u00b7 ')}</div>}
			</div>
		</AchievementRow>
	);
};

// One badge on its own, with what the plugin suggests watching for it.
export const AchievementsBadgeView = ({badge, onSelectItem}) => {
	const read = useCallback(() => achievementsApi.fetchBadgeChase(badge.id), [badge.id]);
	const {data: chase, loading} = useLoadOnOpen(read);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-badge-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	// The badge carries its own figures, so they stand in when the chase had nothing to say.
	const current = chase ? chase.current : badge.currentValue;
	const target = chase ? chase.target : badge.targetValue;
	const items = chase ? chase.items : [];

	return (
		<SettingsView spotlightId="achievements-badge-view">
			<SectionTitle>{badge.isSecret ? $L('Hidden achievement') : badge.title}</SectionTitle>
			{badge.description && !badge.descriptionHidden && (
				<div className={css.badgeBlurb}>{badge.description}</div>
			)}
			<SectionTitle>{$L('Progress')}</SectionTitle>
			<div className={css.progressBlock}>
				<div className={css.progressFigure}>{`${current} / ${target}`}</div>
				<Bar value={badge.progress} color={rarityColor(badge.rarity)} />
			</div>
			<SectionTitle>{$L('Suggested items to watch')}</SectionTitle>
			{items.length === 0
				? <Message>{$L('Nothing to suggest for this badge.')}</Message>
				: items.map((item) => <ChaseRow key={item.id} item={item} onSelectItem={onSelectItem} />)}
		</SettingsView>
	);
};

const heldLabel = (count) => {
	if (count <= 0) return $L('None held');
	if (count === 1) return $L('1 held');
	return $L('{count} held').replace('{count}', String(count));
};

const PowerUpRow = ({slot, busy, onUse}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	const handleClick = useCallback(() => onUse(slot), [onUse, slot]);
	const body = powerUpBody(slot.type);
	const held = heldLabel(slot.count);
	const offered = slot.count > 0 && !busy;

	// The row keeps its press only while there is one to spend, but it is never dimmed, since
	// holding none is already said underneath and a greyed row is harder to read from a sofa.
	return (
		<AchievementRow
			spotlightId={`achievement-powerup-${slot.type}`}
			onClick={offered ? handleClick : null}
		>
			<TileIcon icon={slot.icon} color={accent} />
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>{powerUpName(slot.type)}</div>
				{body && <div className={settingsCss.listItemCaption}>{body}</div>}
				<div className={css.progressText} style={slot.active ? {color: accent} : null}>
					{slot.active ? `${held} · ${$L('Running now')}` : held}
				</div>
			</div>
		</AchievementRow>
	);
};

const ShopRow = ({item, affordable, onBuy}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	const handleClick = useCallback(() => onBuy(item), [onBuy, item]);
	const name = powerUpName(item.type);
	const body = powerUpBody(item.type);

	return (
		<AchievementRow
			spotlightId={`achievement-shop-${item.id}`}
			onClick={affordable ? handleClick : null}
		>
			<TileIcon icon="storefront" color={accent} />
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>
					{item.bundleSize > 1
						? $L('{name} ×{count}').replace('{name}', name).replace('{count}', String(item.bundleSize))
						: name}
				</div>
				{body && <div className={settingsCss.listItemCaption}>{body}</div>}
			</div>
			<div className={css.price} style={affordable ? {color: accent} : null}>
				{$L('{score} points').replace('{score}', String(item.priceScore))}
			</div>
		</AchievementRow>
	);
};

// The spending screens ask before they write, so the asking, the busy flag and whatever a refusal
// came back with are held here. perform does the write and hands back what went wrong, or nothing
// when it worked.
const useSpendConfirm = (perform) => {
	const [asking, setAsking] = useState(null);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState('');

	const ask = useCallback((subject) => setAsking(subject), []);
	const cancel = useCallback(() => setAsking(null), []);

	// A write that needs no asking first, which still wants the busy flag and the same message.
	const run = useCallback(async (write) => {
		setBusy(true);
		setProblem('');

		const failed = await write();
		setBusy(false);
		setProblem(failed || '');
	}, []);

	const confirm = useCallback(() => {
		const subject = asking;
		setAsking(null);
		return run(() => perform(subject));
	}, [asking, perform, run]);

	return {asking, busy, problem, ask, cancel, confirm, run};
};

// The score bank and the consumables it has bought.
export const AchievementsLoadoutView = ({onOpen}) => {
	const {data: state, setData: setState, loading, reload} = useLoadOnOpen(achievementsApi.fetchPowerUps);

	const spend = useCallback(async (slot) => {
		const result = await achievementsApi.usePowerUp(slot.type);
		if (result.outcome !== POWER_UP_USED) return result.message || $L('Could not use that power-up.');
		// Spending one costs no score, so only the inventory moves.
		setState((prev) => ({bank: prev.bank, slots: result.slots}));
		return null;
	}, [setState]);

	const {asking, busy, problem, ask, cancel, confirm} = useSpendConfirm(spend);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-loadout-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	if (!state) {
		return (
			<SettingsView spotlightId="achievements-loadout-view">
				<LoadFailed spotlightId="loadout-retry" onRetry={reload} />
			</SettingsView>
		);
	}

	return (
		<SettingsView spotlightId="achievements-loadout-view">
			<ScoreBank bank={state.bank} />
			<SectionTitle>{$L('Power-ups')}</SectionTitle>
			{state.slots.map((slot) => (
				<PowerUpRow key={slot.type} slot={slot} busy={busy} onUse={ask} />
			))}
			<OpenScreenRow
				id="achievements-shop"
				title={$L('Shop')}
				desc={$L('Spend score on more boosts')}
				icon="storefront"
				view="achievementsShop"
				onOpen={onOpen}
			/>
			{problem && <Message>{problem}</Message>}
			<ConfirmSpendDialog
				open={Boolean(asking)}
				title={$L('Use this power-up?')}
				body={$L("It's spent as soon as you confirm.")}
				onCancel={cancel}
				onConfirm={confirm}
			/>
		</SettingsView>
	);
};

const COSMETIC_KINDS = [COSMETIC_AVATAR, COSMETIC_RANK_TITLE];

// One avatar or title, and whichever of wearing or buying it allows. Nothing to do with one that
// has to be earned and has not been, or one the bank is short of.
const CosmeticRow = ({item, worn, busy, onWear, onBuy}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	const wearing = equippedCosmetic(worn, item.kind) === item.id;
	const held = ownsCosmetic(worn, item);
	const affordable = item.priceScore <= worn.bank;

	const handleWear = useCallback(() => onWear(item), [onWear, item]);
	const handleBuy = useCallback(() => onBuy(item), [onBuy, item]);

	let press = null;
	if (!busy) {
		if (held) press = handleWear;
		else if (!item.isEarned && affordable) press = handleBuy;
	}

	// Never dimmed, since what blocks a press already shows in the row itself, as a price the bank
	// cannot cover or the score an earned one still needs.
	return (
		<AchievementRow spotlightId={`achievement-cosmetic-${item.id}`} onClick={press}>
			<TileIcon icon={item.icon} color={accent} />
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>{item.name}</div>
				{wearing && (
					<div className={css.progressText} style={{color: accent}}>{$L('Equipped')}</div>
				)}
				{!wearing && held && <div className={css.progressText}>{$L('Owned')}</div>}
				{!held && item.isEarned && (
					<>
						<div className={css.progressText}>
							{$L('Earned at {score} lifetime score').replace('{score}', String(item.milestoneScore))}
						</div>
						<div className={css.rowBar}>
							<Bar value={Math.min(1, worn.lifetimeScore / item.milestoneScore)} color={accent} slim />
						</div>
					</>
				)}
			</div>
			{wearing && <Icon name="check_circle" className={css.wornCheck} />}
			{!wearing && !held && !item.isEarned && (
				<div className={css.price} style={affordable ? {color: accent} : null}>
					{$L('{score} points').replace('{score}', String(item.priceScore))}
				</div>
			)}
		</AchievementRow>
	);
};

// The avatars and titles a profile can wear, and the shop for the rest. onChanged refreshes the
// screen behind this one, since the rank header up there is drawn from whatever is worn.
export const AchievementsAppearanceView = ({onChanged}) => {
	const {data: worn, setData: setWorn, loading, reload} = useLoadOnOpen(achievementsApi.fetchCosmetics);
	const [kind, setKind] = useState(COSMETIC_AVATAR);

	const buy = useCallback(async (item) => {
		const result = await achievementsApi.buyShopItem(item.id);
		if (result.outcome !== PURCHASE_BOUGHT) return result.message || $L('Could not buy that.');
		setWorn((prev) => boughtCosmetic(prev, item.id, result.bankAfter));
		onChanged();
		return null;
	}, [setWorn, onChanged]);

	const {asking, busy, problem, ask, cancel, confirm, run} = useSpendConfirm(buy);

	// Puts one on, or takes it off when it is already the one worn.
	const changeWear = useCallback((item) => run(async () => {
		const wearing = equippedCosmetic(worn, item.kind) === item.id;
		const result = wearing
			? await achievementsApi.unequipCosmetic(item.kind)
			: await achievementsApi.equipCosmetic(item.id);

		if (result.outcome !== COSMETIC_CHANGED) {
			return result.message || $L('Could not change how the profile looks.');
		}
		setWorn((prev) => wearingCosmetic(prev, item.kind, wearing ? null : item.id));
		onChanged();
		return null;
	}), [run, worn, setWorn, onChanged]);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-appearance-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	if (!worn) {
		return (
			<SettingsView spotlightId="achievements-appearance-view">
				<LoadFailed spotlightId="appearance-retry" onRetry={reload} />
			</SettingsView>
		);
	}

	if (cosmeticsAreEmpty(worn)) {
		return (
			<SettingsView spotlightId="achievements-appearance-view">
				<Message>{$L('This server has no avatars or titles to wear.')}</Message>
			</SettingsView>
		);
	}

	return (
		<SettingsView spotlightId="achievements-appearance-view">
			<Tabs
				ids={COSMETIC_KINDS}
				labels={[$L('Avatars'), $L('Titles')]}
				activeId={kind}
				onSelect={setKind}
				spotlightId="appearance-tabs"
				expanded
			/>
			<ScoreBank bank={worn.bank} />
			{cosmeticsOf(worn, kind).map((item) => (
				<CosmeticRow
					key={item.id}
					item={item}
					worn={worn}
					busy={busy}
					onWear={changeWear}
					onBuy={ask}
				/>
			))}
			{problem && <Message>{problem}</Message>}
			<ConfirmSpendDialog
				open={Boolean(asking)}
				title={$L('Buy this?')}
				body={$L('It comes straight out of your score bank.')}
				onCancel={cancel}
				onConfirm={confirm}
			/>
		</SettingsView>
	);
};

// The counters worth showing, in the order they read best. The plugin sends more than this. What
// is left out is either a duplicate of something here, like minutes beside hours, or plumbing a
// badge counts on that means nothing on its own.
const statGroups = () => [
	{
		header: $L('Watched'),
		rows: [
			['TotalItemsWatched', $L('Items watched')],
			['MoviesWatched', $L('Films watched')],
			['SeriesCompleted', $L('Series finished')],
			['TotalHoursWatched', $L('Hours watched')],
			['DaysWatched', $L('Days watched')],
			['RewatchCount', $L('Rewatches')]
		]
	},
	{
		header: $L('Bests'),
		rows: [
			['BestWatchStreak', $L('Best watch streak')],
			['BestLoginStreak', $L('Best login streak')],
			['MaxEpisodesInSingleDay', $L('Most episodes in a day')],
			['MaxMoviesInSingleDay', $L('Most films in a day')],
			['LongestItemMinutes', $L('Longest single item')],
			['BestComboCount', $L('Best combo')]
		]
	},
	{
		header: $L('Habits'),
		rows: [
			['LateNightSessions', $L('Late night sessions')],
			['EarlyMorningSessions', $L('Early morning sessions')],
			['WeekendSessions', $L('Weekend sessions')],
			['DaysLoggedIn', $L('Days signed in')]
		]
	},
	{
		header: $L('Variety'),
		rows: [
			['UniqueLibrariesVisited', $L('Libraries visited')],
			['UniqueGenresWatched', $L('Genres watched')],
			['UniqueDecadesWatched', $L('Decades watched')],
			['UniqueCountriesWatched', $L('Countries watched')],
			['UniqueLanguagesWatched', $L('Languages watched')]
		]
	}
];

const StatRow = ({label, value, spotlightId}) => (
	<AchievementRow spotlightId={spotlightId}>
		<div className={settingsCss.listItemBody}>
			<div className={settingsCss.listItemHeading}>{label}</div>
		</div>
		<div className={css.statValue}>{value}</div>
	</AchievementRow>
);

// A heading and its rows, or nothing when the server sent none of them.
const StatSection = ({header, rows}) => {
	const shown = rows.filter(Boolean);
	if (shown.length === 0) return null;
	return (
		<>
			<SectionTitle>{header}</SectionTitle>
			{shown}
		</>
	);
};

const CLOCK_HOURS = [...Array(24).keys()];
const CLOCK_LABELS = [0, 6, 12, 18, 23];

// Each hour is drawn as a share of the busiest one, over a 56px box with a 2px floor so an hour
// with nothing in it still reads as a column.
const barHeight = (count, busiest) => percent((2 + 54 * (count / busiest)) / 56);

const WatchClock = ({hours}) => {
	const busiest = CLOCK_HOURS.reduce((most, hour) => Math.max(most, hours[hour] || 0), 0);
	if (busiest === 0) return null;

	return (
		<div className={css.clock}>
			<div className={css.clockBars}>
				{CLOCK_HOURS.map((hour) => (
					<div key={hour} className={css.clockBar} style={{height: barHeight(hours[hour] || 0, busiest)}} />
				))}
			</div>
			<div className={css.clockLabels}>
				{CLOCK_LABELS.map((hour) => <span key={hour}>{hour}</span>)}
			</div>
		</div>
	);
};

// The one counter that is a run time rather than a tally.
const statValue = (key, count) =>
	(key === 'LongestItemMinutes'
		? $L('{minutes} min').replace('{minutes}', String(count))
		: String(count));

const serverRows = (server) => [
	['users', $L('Users'), String(server.users)],
	['badges', $L('Badges unlocked'), String(server.badgesUnlocked)],
	['items', $L('Items watched'), String(server.itemsWatched)],
	['movies', $L('Films watched'), String(server.moviesWatched)],
	['series', $L('Series finished'), String(server.seriesCompleted)],
	['score', $L('Score earned'), String(server.score)],
	...(server.mostCommonBadge ? [['common-badge', $L('Most common badge'), server.mostCommonBadge]] : [])
];

// A user's own records, and how the whole server is doing when the admin has not hidden it.
export const AchievementsStatsView = () => {
	const {data: stats, loading} = useLoadOnOpen(achievementsApi.fetchStats);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-stats-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	if (statsAreEmpty(stats)) {
		return (
			<SettingsView spotlightId="achievements-stats-view">
				<Message>{$L('Nothing here yet.')}</Message>
			</SettingsView>
		);
	}

	const {records, server} = stats;

	return (
		<SettingsView spotlightId="achievements-stats-view">
			{statGroups().map((group) => (
				<StatSection
					key={group.header}
					header={group.header}
					rows={group.rows.map(([key, label]) => (
						key in records
							? <StatRow
								key={key}
								spotlightId={`achievement-stat-${key}`}
								label={label}
								value={statValue(key, records[key])}
							/>
							: null
					))}
				/>
			))}
			{Object.keys(stats.watchClock).length > 0 && (
				<>
					<SectionTitle>{$L('When you watch')}</SectionTitle>
					<WatchClock hours={stats.watchClock} />
				</>
			)}
			{server && (
				<StatSection
					header={$L('This server')}
					rows={serverRows(server).map(([key, label, value]) => (
						<StatRow key={key} spotlightId={`achievement-stat-server-${key}`} label={label} value={value} />
					))}
				/>
			)}
		</SettingsView>
	);
};

const ActivityRow = ({entry, spotlightId}) => (
	<AchievementRow spotlightId={spotlightId}>
		<TileIcon icon={entry.icon} color={rarityColor(entry.rarity)} />
		<div className={settingsCss.listItemBody}>
			<div className={settingsCss.listItemHeading}>
				{$L('{user} unlocked {badge}')
					.replace('{user}', entry.userName)
					.replace('{badge}', entry.badgeTitle)}
			</div>
			{entry.at && <div className={css.progressText}>{relativeTimeLabel(entry.at)}</div>}
		</div>
	</AchievementRow>
);

// What everyone on the server has unlocked lately.
export const AchievementsActivityView = () => {
	const {data: entries, loading} = useLoadOnOpen(achievementsApi.fetchActivity);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-activity-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	return (
		<SettingsView spotlightId="achievements-activity-view">
			{entries.length === 0
				? <Message>{$L('Nothing here yet.')}</Message>
				: entries.map((entry, index) => (
					<ActivityRow key={index} entry={entry} spotlightId={`achievement-activity-${index}`} />
				))}
		</SettingsView>
	);
};

// The catalogue carries no bank, so the two are read together.
const readShop = async () => {
	const [items, state] = await Promise.all([
		achievementsApi.fetchShopPowerUps(),
		achievementsApi.fetchPowerUps()
	]);
	return {items, bank: state ? state.bank : 0};
};

// What score can be spent on. Going back to the loadout mounts it afresh, so a purchase shows up
// in both the bank and the inventory without either screen being told about it.
export const AchievementsShopView = () => {
	const {data, setData, loading} = useLoadOnOpen(readShop);

	const buy = useCallback(async (item) => {
		const result = await achievementsApi.buyShopItem(item.id);
		if (result.outcome !== PURCHASE_BOUGHT) return result.message || $L('Could not buy that.');
		if (result.bankAfter !== null) setData((prev) => ({...prev, bank: result.bankAfter}));
		return null;
	}, [setData]);

	const {asking, busy, problem, ask, cancel, confirm} = useSpendConfirm(buy);

	if (loading) {
		return (
			<SettingsView spotlightId="achievements-shop-view">
				<Message>{$L('Loading...')}</Message>
			</SettingsView>
		);
	}

	return (
		<SettingsView spotlightId="achievements-shop-view">
			<ScoreBank bank={data.bank} />
			{data.items.length === 0
				? <Message>{$L('Nothing for sale right now.')}</Message>
				: data.items.map((item) => (
					<ShopRow
						key={item.id}
						item={item}
						affordable={item.priceScore <= data.bank && !busy}
						onBuy={ask}
					/>
				))}
			{problem && <Message>{problem}</Message>}
			<ConfirmSpendDialog
				open={Boolean(asking)}
				title={$L('Buy this?')}
				body={$L('It comes straight out of your score bank.')}
				onCancel={cancel}
				onConfirm={confirm}
			/>
		</SettingsView>
	);
};

const QuestRow = ({quest}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	return (
		<AchievementRow spotlightId={`achievement-quest-${quest.id}`}>
			<TileIcon icon={quest.completed ? 'check_circle' : quest.icon} color={accent} />
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>{quest.title}</div>
				{quest.description && <div className={settingsCss.listItemCaption}>{quest.description}</div>}
				<div className={css.rowBar}><Bar value={quest.progress} color={accent} slim /></div>
				<div className={css.progressText}>{`${quest.current} / ${quest.target}`}</div>
			</div>
			<div className={css.reward}>{$L('+{points}').replace('{points}', String(quest.reward))}</div>
		</AchievementRow>
	);
};

const RerollRow = ({weekly, rerollsLeft = 0, busy, onReroll}) => {
	const handleClick = useCallback(() => onReroll(weekly), [onReroll, weekly]);
	const spent = rerollsLeft <= 0;
	const offered = !spent && !busy;

	return (
		<SpottableDiv
			className={`${settingsCss.listItem}${offered ? '' : ` ${css.rowSpent}`}`}
			spotlightId={`setting-achievement-reroll-${weekly ? 'weekly' : 'daily'}`}
			onClick={offered ? handleClick : null}
		>
			{renderSettingsIcon('casino')}
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>
					{weekly ? $L('Reroll weekly quests') : $L('Reroll daily quests')}
				</div>
				<div className={settingsCss.listItemCaption}>
					{!spent
						? $L('Swap this set for a different one')
						: weekly
							? $L('Used this week, comes back Monday UTC')
							: $L('Used today, comes back at midnight UTC')}
				</div>
			</div>
		</SpottableDiv>
	);
};

// The server is the authority on what is left, so its answer settles the row whether it handed
// back a fresh set or refused.
const afterReroll = (quests, weekly, result) => {
	const rerolled = result.outcome === REROLLED;
	const left = rerolled ? result.rerollsLeft : 0;
	if (weekly) {
		return {...quests, weekly: rerolled ? result.quests : quests.weekly, weeklyRerollsLeft: left};
	}
	return {...quests, daily: rerolled ? result.quests : quests.daily, dailyRerollsLeft: left};
};

export const AchievementsQuestsView = ({quests: initial}) => {
	const [quests, setQuests] = useState(initial);
	const [asking, setAsking] = useState(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const askReroll = useCallback((weekly) => setAsking(weekly ? 'weekly' : 'daily'), []);
	const cancelReroll = useCallback(() => setAsking(null), []);

	const confirmReroll = useCallback(async () => {
		const weekly = asking === 'weekly';
		setAsking(null);
		setBusy(true);
		setFailed(false);

		const result = await achievementsApi.rerollQuests({weekly});
		setBusy(false);
		if (result.outcome === REROLL_FAILED) {
			setFailed(true);
			return;
		}
		setQuests((prev) => afterReroll(prev, weekly, result));
	}, [asking]);

	return (
		<SettingsView spotlightId="achievements-quests-view">
			{quests.daily.length > 0 && (
				<>
					<SectionTitle>{$L('Daily')}</SectionTitle>
					{quests.daily.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
					<RerollRow rerollsLeft={quests.dailyRerollsLeft} busy={busy} onReroll={askReroll} />
				</>
			)}
			{quests.weekly.length > 0 && (
				<>
					<SectionTitle>{$L('Weekly')}</SectionTitle>
					{quests.weekly.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
					<RerollRow weekly rerollsLeft={quests.weeklyRerollsLeft} busy={busy} onReroll={askReroll} />
				</>
			)}
			{failed && <Message>{$L('Could not reroll those quests.')}</Message>}
			<ConfirmSpendDialog
				open={Boolean(asking)}
				title={$L('Reroll these quests?')}
				body={$L('You get one daily and one weekly reroll, and this spends it.')}
				onCancel={cancelReroll}
				onConfirm={confirmReroll}
			/>
		</SettingsView>
	);
};

export const AchievementsLeaderboardView = ({initial}) => {
	const [board, setBoard] = useState(OVERALL_BOARD);
	const [entries, setEntries] = useState(initial);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (board === OVERALL_BOARD) {
			setEntries(initial);
			return undefined;
		}
		let cancelled = false;
		setLoading(true);
		achievementsApi.fetchLeaderboard({category: board}).then((rows) => {
			if (cancelled) return;
			setEntries(rows);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [board, initial]);

	const selectBoard = useCallback((id) => {
		if (!loading) setBoard(id);
	}, [loading]);

	const labels = [
		$L('Score'), $L('Movies'), $L('Episodes'), $L('Hours'),
		$L('Streak'), $L('Series'), $L('Badges')
	];

	return (
		<SettingsView spotlightId="achievements-leaderboard-view">
			<Tabs
				ids={BOARDS}
				labels={labels}
				activeId={board}
				onSelect={selectBoard}
				spotlightId="achievement-board"
			/>
			{loading && <Message>{$L('Loading...')}</Message>}
			{!loading && entries.length === 0 && <Message>{$L('Nothing here yet.')}</Message>}
			{!loading && entries.map((entry, index) => (
				<AchievementRow key={entry.userId || index} spotlightId={`achievement-board-row-${index}`}>
					<div className={css.rankGutter}>{index + 1}</div>
					<div className={settingsCss.listItemBody}>
						<div className={settingsCss.listItemHeading}>{entry.userName}</div>
						{(entry.customTitle || entry.unlocked !== null) && (
							<div className={settingsCss.listItemCaption}>
								{entry.customTitle || $L('{unlocked} of {total} badges')
									.replace('{unlocked}', String(entry.unlocked))
									.replace('{total}', String(entry.total || 0))}
							</div>
						)}
					</div>
					<div className={css.boardValue}>{leaderboardValue(entry)}</div>
				</AchievementRow>
			))}
		</SettingsView>
	);
};

const CountList = ({title, counts, idPrefix}) => (
	<>
		<SectionTitle>{title}</SectionTitle>
		{counts.map((count, index) => (
			<AchievementRow key={count.name} spotlightId={`${idPrefix}-${index}`}>
				<div className={settingsCss.listItemBody}>
					<div className={settingsCss.listItemHeading}>{count.name}</div>
				</div>
				<div className={css.boardValue}>{count.count}</div>
			</AchievementRow>
		))}
	</>
);

export const AchievementsRecapView = ({initial}) => {
	const [period, setPeriod] = useState(achievementsApi.DEFAULT_RECAP_PERIOD);
	const [recap, setRecap] = useState(initial);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (period === achievementsApi.DEFAULT_RECAP_PERIOD) {
			setRecap(initial);
			return undefined;
		}
		let cancelled = false;
		setLoading(true);
		achievementsApi.fetchRecap(period).then((next) => {
			if (cancelled) return;
			setRecap(next);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [period, initial]);

	const selectPeriod = useCallback((id) => {
		if (!loading) setPeriod(id);
	}, [loading]);

	return (
		<SettingsView spotlightId="achievements-recap-view">
			<Tabs
				ids={PERIODS}
				labels={[$L('Week'), $L('Month'), $L('Year')]}
				activeId={period}
				onSelect={selectPeriod}
				spotlightId="achievement-period"
			/>
			{loading && <Message>{$L('Loading...')}</Message>}
			{!loading && !recap && <Message>{$L('Nothing here yet.')}</Message>}
			{!loading && recap && (
				<>
					<div className={css.chips} style={{padding: '0 24px 16px'}}>
						<Chip icon="movie" label={`${recap.moviesWatched} ${$L('Movies')}`} />
						<Chip icon="live_tv" label={`${recap.episodesWatched} ${$L('Episodes')}`} />
						<Chip
							icon="calendar_month"
							label={$L('{count} days watched').replace('{count}', String(recap.daysWatched))}
						/>
						<Chip
							icon="military_tech"
							label={$L('{count} badges earned').replace('{count}', String(recap.badgesUnlocked))}
						/>
					</div>
					{recap.topGenres.length > 0 && (
						<CountList title={$L('Genres')} counts={recap.topGenres} idPrefix="achievement-genre" />
					)}
					{recap.topDirectors.length > 0 && (
						<CountList title={$L('Top directors')} counts={recap.topDirectors} idPrefix="achievement-director" />
					)}
					{recap.topActors.length > 0 && (
						<CountList title={$L('Top actors')} counts={recap.topActors} idPrefix="achievement-actor" />
					)}
				</>
			)}
		</SettingsView>
	);
};

export const AchievementsLibraryView = ({completion}) => {
	const accent = useSurfaceAccent('achievements', DEFAULT_ACCENT);
	return (
		<SettingsView spotlightId="achievements-library-view">
			{Object.keys(completion).sort().map((name) => (
				<AchievementRow key={name} spotlightId={`achievement-library-${name}`}>
					<div className={settingsCss.listItemBody}>
						<div className={settingsCss.listItemHeading}>{name}</div>
						<div className={css.rowBar}>
							<Bar value={Math.min(1, Math.max(0, completion[name] / 100))} color={accent} slim />
						</div>
					</div>
					<div className={css.boardValue}>{`${completion[name]}%`}</div>
				</AchievementRow>
			))}
		</SettingsView>
	);
};
