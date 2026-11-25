// Every route the app has. keepAlive keeps the page alive under the pages opened over it, so Back
// lands on the same row and card, and inHistory false lets the next page replace it. Pages that
// aren't needed at boot load lazily.
import { lazy } from 'solid-js'
import { defineRoutes } from './app/router.js'
import Startup from './pages/Startup.jsx'
import Home from './pages/Home.jsx'
import PinGate from './pages/Shell/PinGate.jsx'

// Details and its styles were a fifth of the code webOS compiled before its first frame, and a
// signed-in launch never shows sign-in or the setup wizard, so they load lazily too. App's Quick
// Look draws this same Details, and App loads it in the background once Home has shown.
export const Details = lazy(() => import('./pages/Details/Details.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const SetupWizard = lazy(() => import('./pages/Shell/SetupWizard.jsx'))

const Trailer = lazy(() => import('./pages/Details/Trailer.jsx'))
const Library = lazy(() => import('./pages/Library/Library.jsx'))
const GenreBrowse = lazy(() => import('./pages/Library/GenreBrowse.jsx'))
const Genres = lazy(() => import('./pages/Library/Genres.jsx'))
const Favorites = lazy(() => import('./pages/Library/Favorites.jsx'))
const Search = lazy(() => import('./pages/Search/Search.jsx'))
const Player = lazy(() => import('./pages/Player/Player.jsx'))
const SeerrDiscover = lazy(() => import('./pages/Seerr/Discover.jsx'))
const SeerrRequests = lazy(() => import('./pages/Seerr/Requests.jsx'))
const SeerrBrowse = lazy(() => import('./pages/Seerr/Browse.jsx'))
const SeerrPerson = lazy(() => import('./pages/Seerr/Person.jsx'))
const SeerrCollection = lazy(() => import('./pages/Seerr/Collection.jsx'))
const MusicLibrary = lazy(() => import('./pages/Music/MusicLibrary.jsx'))
const NowPlaying = lazy(() => import('./pages/Music/NowPlaying.jsx'))
const LiveTV = lazy(() => import('./pages/LiveTV/LiveTV.jsx'))
const Recordings = lazy(() => import('./pages/LiveTV/Recordings.jsx'))
const Photos = lazy(() => import('./pages/Media/Photos.jsx'))
const Calendar = lazy(() => import('./pages/Media/Calendar.jsx'))
const CalendarMonth = lazy(() => import('./pages/Media/CalendarMonth.jsx'))
const Books = lazy(() => import('./pages/Media/Books.jsx'))
const Reader = lazy(() => import('./pages/Media/Reader.jsx'))
const Settings = lazy(() => import('./pages/Settings/Settings.jsx'))
const Games = lazy(() => import('./pages/Games/Games.jsx'))
const GameSystem = lazy(() => import('./pages/Games/GameSystem.jsx'))
const GameDetails = lazy(() => import('./pages/Games/GameDetails.jsx'))
const GamePlayer = lazy(() => import('./pages/Games/GamePlayer.jsx'))
export const WatchParty = lazy(() => import('./pages/WatchParty/WatchParty.jsx'))

defineRoutes([
  { path: '/', component: Startup, inHistory: false },
  { path: '/login', component: Login, inHistory: false },
  { path: '/pin', component: PinGate, inHistory: false },
  { path: '/setup', component: SetupWizard, inHistory: false },
  { path: '/home', component: Home, keepAlive: true },
  { path: '/details/:id', component: Details, keepAlive: true },
  { path: '/person/:id', component: Details, keepAlive: true },
  { path: '/trailer/:id', component: Trailer },
  { path: '/library/:id', component: Library, keepAlive: true },
  { path: '/genre/:libraryId/:genreId', component: Library, keepAlive: true },
  { path: '/genrebrowse/:id', component: GenreBrowse, keepAlive: true },
  { path: '/genres', component: Genres, keepAlive: true },
  { path: '/genres/:id', component: Genres, keepAlive: true },
  { path: '/favorites', component: Favorites, keepAlive: true },
  // Search isn't kept alive, so Back from a result lands on a fresh one.
  { path: '/search', component: Search },
  { path: '/seerr', component: SeerrDiscover, keepAlive: true },
  { path: '/seerr/requests', component: SeerrRequests, keepAlive: true },
  // A title only Seerr knows opens on Details.
  { path: '/seerr/item/:mediatype/:id', component: Details, keepAlive: true },
  { path: '/seerr/browse/:kind/:mediatype/:itemid', component: SeerrBrowse, keepAlive: true },
  { path: '/seerr/person/:id', component: SeerrPerson, keepAlive: true },
  { path: '/seerr/collection/:id', component: SeerrCollection, keepAlive: true },
  { path: '/settings', component: Settings },
  { path: '/player/:id', component: Player },
  { path: '/livetv', component: LiveTV, keepAlive: true },
  { path: '/recordings', component: Recordings, keepAlive: true },
  { path: '/music/:id', component: MusicLibrary, keepAlive: true },
  { path: '/album/:id', component: Details, keepAlive: true },
  { path: '/artist/:id', component: Details, keepAlive: true },
  { path: '/nowplaying', component: NowPlaying },
  { path: '/photos/:id', component: Photos, keepAlive: true },
  { path: '/books/:id', component: Books, keepAlive: true },
  { path: '/read/:id', component: Reader },
  { path: '/calendar/month', component: CalendarMonth, keepAlive: true },
  { path: '/calendar', component: Calendar, keepAlive: true },
  { path: '/games/system/:lib/:system', component: GameSystem, keepAlive: true },
  { path: '/games/item/:lib/:id', component: GameDetails, keepAlive: true },
  { path: '/games/play/:lib/:id', component: GamePlayer },
  { path: '/games/:id', component: Games, keepAlive: true },
  // Watch Parties open as a dialog over the page (App's beforeEach), the route only names it.
  { path: '/party', component: WatchParty },
])
