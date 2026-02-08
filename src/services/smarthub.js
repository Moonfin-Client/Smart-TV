/* global tizen, api */
import * as jellyfinApi from './jellyfinApi';
import { getImageUrl } from '../utils/helpers';

var packageId = typeof tizen !== 'undefined' && tizen.application ? tizen.application.getCurrentApplication().appInfo.packageId : 'unknown';
var serviceId = packageId + '.service';
var localMessagePort;
var messagePortListener;
let jellyfinServerUrl = null;
console.error('Jellyfin Server URL:', packageId, serviceId);


/** Get the URL of the card's image.
 * @param {Object} item - Item for which to generate tileimageurk
 * @returns {CardImageUrl} Object representing the URL of the card's image.
 */
function getTileImageUrl(item) {
    item = item.ProgramInfo || item;

    var options = {
        preferThumb: true,
        inheritThumb: true
    };

    var height = 250;
    var imgUrl = null;
    var imgTag = null;
    var imgType = null;
    var itemId = null;

    if (options.preferThumb && item.ImageTags && item.ImageTags.Thumb) {
        imgType = 'Thumb';
        imgTag = item.ImageTags.Thumb;
    } else if (options.preferThumb && item.SeriesThumbImageTag && options.inheritThumb !== false) {
        imgType = 'Thumb';
        imgTag = item.SeriesThumbImageTag;
        itemId = item.SeriesId;
    } else if (options.preferThumb && item.ParentThumbItemId && options.inheritThumb !== false && item.MediaType !== 'Photo') {
        imgType = 'Thumb';
        imgTag = item.ParentThumbImageTag;
        itemId = item.ParentThumbItemId;
    } else if (options.preferThumb && item.BackdropImageTags && item.BackdropImageTags.length) {
        imgType = 'Backdrop';
        imgTag = item.BackdropImageTags[0];
    } else if (options.preferThumb && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length && options.inheritThumb !== false && item.Type === 'Episode') {
        imgType = 'Backdrop';
        imgTag = item.ParentBackdropImageTags[0];
        itemId = item.ParentBackdropItemId;
    } else if (item.ImageTags && item.ImageTags.Primary && (item.Type !== 'Episode' || item.ChildCount !== 0)) {
        imgType = 'Primary';
        imgTag = item.ImageTags.Primary;
    } else if (item.SeriesPrimaryImageTag) {
        imgType = 'Primary';
        imgTag = item.SeriesPrimaryImageTag;
        itemId = item.SeriesId;
    } else if (item.PrimaryImageTag) {
        imgType = 'Primary';
        imgTag = item.PrimaryImageTag;
        itemId = item.PrimaryImageItemId;
    } else if (item.ParentPrimaryImageTag) {
        imgType = 'Primary';
        imgTag = item.ParentPrimaryImageTag;
        itemId = item.ParentPrimaryImageItemId;
    } else if (item.AlbumId && item.AlbumPrimaryImageTag) {
        imgType = 'Primary';
        imgTag = item.AlbumPrimaryImageTag;
        itemId = item.AlbumId;
    } else if (item.Type === 'Season' && item.ImageTags && item.ImageTags.Thumb) {
        imgType = 'Thumb';
        imgTag = item.ImageTags.Thumb;
    } else if (item.BackdropImageTags && item.BackdropImageTags.length) {
        imgType = 'Backdrop';
        imgTag = item.BackdropImageTags[0];
    } else if (item.ImageTags && item.ImageTags.Thumb) {
        imgType = 'Thumb';
        imgTag = item.ImageTags.Thumb;
    } else if (item.SeriesThumbImageTag && options.inheritThumb !== false) {
        imgType = 'Thumb';
        imgTag = item.SeriesThumbImageTag;
        itemId = item.SeriesId;
    } else if (item.ParentThumbItemId && options.inheritThumb !== false) {
        imgType = 'Thumb';
        imgTag = item.ParentThumbImageTag;
        itemId = item.ParentThumbItemId;
    } else if (item.ParentBackdropImageTags && item.ParentBackdropImageTags.length && options.inheritThumb !== false) {
        imgType = 'Backdrop';
        imgTag = item.ParentBackdropImageTags[0];
        itemId = item.ParentBackdropItemId;
    }
  

    if (!itemId) {
        itemId = item.Id;
    }

    /*if (imgTag && imgType) {
        var params = {
            type: imgType,
            fillHeight: height,
            quality: 96,
            tag: imgTag,
            format: 'jpg'
        };
        var playedPercentage = item && item.UserData && item.UserData.PlayedPercentage;
        if (playedPercentage !== null && playedPercentage !== undefined) {
            params.percentPlayed = playedPercentage;
        }
        console.error('Server URL:', jellyfinApi.getServerUrl());
        imgUrl = getImageUrl(itemId, params);
            imgUrl = getImageUrl(
        jellyfinServerUrl,   // 1️⃣ serverUrl
        itemId,      // 2️⃣ itemId
        imgType,     // 3️⃣ imageType (pl. 'Primary', 'Backdrop')
        params       // 4️⃣ options
    );

    }*/
    var serverUrl = jellyfinApi.getServerUrl();
    var params = new URLSearchParams({
        fillHeight: height,
        quality: 96,
        tag: imgTag,
        format: 'jpg'
    });
    var playedPercentage = item && item.UserData && item.UserData.PlayedPercentage;
    if (playedPercentage !== null && playedPercentage !== undefined) {
        params.set('percentPlayed', playedPercentage);
    }
    imgUrl = serverUrl + '/Items/' + itemId + '/Images/' + imgType + '?' + params.toString();  

    return imgUrl;
}

/**
 * Creates a JSON object representing one title for the smart view.
 *
 * @param {Object} title_data - The title data containing details about the media items.
 * @param {string} title_data.ServerId - The server ID associated with the media.
 * @param {string} title_data.Id - The unique ID of the "Episode"
 * @param {number} title_data.ParentIndexNumber - The "Series" index number of the media.
 * @param {number} title_data.IndexNumber - The index number of the media.
 * @param {string} title_data.Name - The name of the Movie
 * @param {string} title_data.SeriesName - The name of the Series
 * @param {string} title_data.ParentBackdropItemId - The ID for the backdrop image.
 * @param {Object} title_data.UserData - User-specific data, including played percentage.
 * @param {number} title_data.UserData.PlayedPercentage - Percentage of the media played.
 * @returns {Object|null} The formatted title JSON object or `null` if data is invalid.
 */
function generateTitleJson(title_data) {
    if (!title_data) {
        console.warn('Missing title_data');
        return null;
    }

    var action_data =
  {
      serverid: title_data.ServerId,
      id: title_data.Id
  };
    var title = null;

    var imgURL = getTileImageUrl(title_data);

    if (title_data.Type == 'Episode') {
        action_data.type = 'episode';
        action_data.seasonid = title_data.SeasonId;
        action_data.seriesid = title_data.SeriesId;
        var series_episode = '';
        if (title_data.ParentIndexNumber !== undefined && title_data.IndexNumber !== undefined) {
            series_episode = 'S' + title_data.ParentIndexNumber + ':E' + title_data.IndexNumber + ' - ';
        }

        title = {
            title: series_episode + title_data.Name,
            subtitle: title_data.SeriesName,
            image_ratio: '16by9',
            image_url: imgURL,
            action_data: JSON.stringify(action_data),
            is_playable: true
        };
    } else if (title_data.Type == 'Movie') {
        action_data.type = 'movie';
        title = {
            title: title_data.Name,
            image_ratio: '16by9',
            image_url: imgURL,
            action_data: JSON.stringify(action_data),
            is_playable: true
        };
    }
    return title;
}

/**
 * Creates a JSON object for the smart view containing multiple sections and their tiles.
 *
 * @param {Array<Object>} sectionsData - Array of objects representing each section's metadata and content.
 * @param {string} sectionsData[].section_title - Title of the section (e.g., "Next Up", "Continue Watching").
 * @param {number} sectionsData[].limit - Maximum number of items to include in the section.
 * @param {Array<Object>} sectionsData[].data - Array of media items to populate the section's tiles.
 *
 * @returns {Object} A JSON object with `sections` for the smart view.
 *                   Each section contains a title and an array of tiles.
 *                   If no valid sections are provided, the returned object will have an empty `sections` array.
 */
function generateSmartViewJson(sectionsData) {
    // Validate input data
    if (!Array.isArray(sectionsData) || sectionsData.length === 0) {
        console.warn('Invalid or empty sections data.');
        return { sections: [] };
    }

    // Initialize the smart view JSON object
    var smart_view_json = { sections: [] };

    // Populate Sections
    sectionsData.forEach(section => {
        if (Array.isArray(section.data) && section.data.length > 0) {
            var tiles = section.data.slice(0, section.limit).map(generateTitleJson).filter(Boolean);
            if (tiles.length > 0) {
                smart_view_json.sections.push({
                    title: section.section_title,
                    tiles: tiles
                });
            }
        }
    });

    return smart_view_json;
}

/**
 * Launches the Tizen application and send Smartview data
 *
 * @param {Object} smartViewJsonData - The title data containing details about the media items.
 * @throws {Error} Logs any error encountered during the service launch process.
*/
function startServiceAndUpdateSmartView(smartViewJsonData) {
    console.log('Starting Service');
    localMessagePort = tizen.messageport.requestLocalMessagePort(packageId);
    messagePortListener = localMessagePort.addMessagePortListener(OnReceived);
    try {
        tizen.application.launchAppControl(
            new tizen.ApplicationControl(
                'http://tizen.org/appcontrol/operation/pick',
                null,
                'image/jpeg',
                null,
                [
                    new tizen.ApplicationControlData('Preview', [JSON.stringify(smartViewJsonData)])
                ]
            ),
            serviceId,
            () => console.log('Message sent to ' + serviceId),
            (error) => console.error('Launch failed:', error.message)
        );
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

/**
 * Callback function for receiving messages from the Tizen service.
 *
 * @param {Array<Object>} ui_data - The received data array from the service.
 */
var OnReceived = function (ui_data) {
    console.log('Received Data from Service : ' + ui_data[0].value);
    if (ui_data[0].value == 'Service stopping...' || ui_data[0].value == 'Service exiting...') {
        window.smartHubUpdated = true;
        localMessagePort.removeMessagePortListener(messagePortListener);
    }
};

var waitForSmartHubUpdate = () => {
    return new Promise((resolve) => {
        var interval = setInterval(() => {
            if (window.smartHubUpdated === true) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });
};

/**
 * Delays execution for a specified time.
 *
 * @param {number} time - Time in milliseconds to delay.
 * @returns {Promise} A promise that resolves after the specified delay.
 */
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Exported function to manually trigger SmartView update
export async function runSmartViewUpdate() {
    // Wait for ApiClient to be available
    let waitCount = 0;
    while (typeof jellyfinApi === 'undefined' && waitCount < 60) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        waitCount++;
    }
    if (typeof jellyfinApi === 'undefined') {
        throw new Error('ApiClient not available');
    }

    // Wait for server URL and user to be configured (avoid null requests)
    let authWait = 0;
    while ((!jellyfinApi.getServerUrl() || !jellyfinApi.getUserId()) && authWait < 60) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        authWait++;
    }
    const serverUrl = jellyfinApi.getServerUrl();
    const userId = jellyfinApi.getUserId();
    jellyfinServerUrl = serverUrl;
    if (!serverUrl || !userId) {
        console.warn('SmartHub: server or user not configured; skipping update');
        window.smartHubUpdated = true;
        return;
    }

    window.smartHubUpdated = false;
    try {
        const nextUpLimit = 2;
        const resumeLimit = 4;

        const baseOptions = {
            Recursive: true,
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Thumb',
            EnableTotalRecordCount: false
        };

        const [resumableItems, nextUpEpisodes] = await Promise.all([
            jellyfinApi.api.getResumeItems(resumeLimit),
            jellyfinApi.api.getNextUp(nextUpLimit)
        ]);

        const smartViewJsonData = generateSmartViewJson([
            { section_title: 'Next Up', limit: nextUpLimit, data: nextUpEpisodes.Items },
            { section_title: 'Continue Watching', limit: resumeLimit, data: resumableItems.Items }
        ]);

        console.log('Generated SmartViewResult: \n' + JSON.stringify(smartViewJsonData));

        await delay(2000);
        startServiceAndUpdateSmartView(smartViewJsonData);
        await waitForSmartHubUpdate();
    } catch (error) {
        console.error('Error fetching data: ', error);
        window.smartHubUpdated = true;
    }
}

// Init helper to optionally start background refresh loop
let _autoLoopHandle = null;
export function initSmartHub({ autoRefresh = true } = {}) {
    // Expose globally for backward compatibility
    window.runSmartViewUpdate = runSmartViewUpdate;

    if (autoRefresh && !_autoLoopHandle) {
        _autoLoopHandle = (async function loop() {
            while (true) {
                const startTime = Date.now();
                try {
                    await runSmartViewUpdate();
                } catch (e) {
                    console.warn('SmartHub update failed', e);
                }
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(600000 - elapsed, 0);
                await new Promise(r => setTimeout(r, remaining));
            }
        })();
    }
    return { runSmartViewUpdate };
}

