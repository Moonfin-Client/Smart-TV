sub init()
    m.top.backgroundColor = "0x000000FF"
    m.top.backgroundUri = ""
    m.app = m.top.findNode("app")
    m.app.deviceCaps = FormatJson(deviceCaps())
    m.app.setFocus(true)
    m.keySeq = 0
    m.keyQueue = []
    m.held = ""
    m.repeat = CreateObject("roSGNode", "Timer")
    m.repeat.repeat = false
    m.repeat.observeField("fire", "onRepeat")
end sub

' Every remote key reaches the app through its remoteKey field, as the last 32 keys with a count each,
' so a press and its release that land while the app is busy both arrive. A held arrow repeats here,
' after 0.4 s and then every 0.11 s, since a release comes in on time here whatever the app is doing.
function onKeyEvent(key as string, press as boolean) as boolean
    queueKey(key, press, false)
    if press and (key = "up" or key = "down" or key = "left" or key = "right")
        m.held = key
        m.repeat.duration = 0.4
        m.repeat.control = "start"
    else if not press and key = m.held
        m.held = ""
        m.repeat.control = "stop"
    end if
    return true
end function

sub onRepeat()
    if m.held = "" then return
    queueKey(m.held, true, true)
    m.repeat.duration = 0.11
    m.repeat.control = "start"
end sub

sub queueKey(key as string, press as boolean, repeated as boolean)
    m.keySeq = m.keySeq + 1
    m.keyQueue.push({ "key": key, "press": press, "repeat": repeated, "n": m.keySeq })
    if m.keyQueue.count() > 32 then m.keyQueue.shift()
    m.app.remoteKey = FormatJson(m.keyQueue)
end sub

' What this Roku can decode, per container, for the app's device profile. CanDecodeVideo and
' CanDecodeAudio exist only in BrightScript, so the scene asks and the app reads the answer.
function deviceCaps() as object
    di = CreateObject("roDeviceInfo")
    videoCodecs = ["h264", "hevc", "vp9", "mpeg2", "mpeg4 avc"]
    audioCodecs = ["aac", "mp3", "mp2", "ac3", "eac3", "ac4", "dts", "truehd", "flac", "alac", "opus", "vorbis", "pcm", "lpcm", "wma"]
    ' FormatJson lowercases unquoted and dot keys, so the mixed-case ones are written as strings.
    caps = { video: {}, audio: {}, "audioAlone": [] }
    ' AV1 reports false whenever a container is named, so it's asked once on its own.
    av1 = di.CanDecodeVideo({ Codec: "av1" }).Result
    for each container in ["mp4", "mkv", "ts"]
        video = []
        for each codec in videoCodecs
            if di.CanDecodeVideo({ Codec: codec, Container: container }).Result then video.push(codec)
        end for
        if av1 then video.push("av1")
        caps.video[container] = video
        audio = []
        for each codec in audioCodecs
            if di.CanDecodeAudio({ Codec: codec, Container: container }).Result then audio.push(codec)
        end for
        caps.audio[container] = audio
    end for
    for each codec in audioCodecs
        if di.CanDecodeAudio({ Codec: codec }).Result then caps.audioAlone.push(codec)
    end for
    caps.surround = di.CanDecodeAudio({ Codec: "ac3", ChCnt: 6 }).Result
    caps["hevcMain10"] = di.CanDecodeVideo({ Codec: "hevc", Profile: "main 10" }).Result
    ' Only the HDR flags, since the display properties also hold EDID bytes FormatJson can't write.
    display = di.GetDisplayProperties()
    caps.hdr = {}
    for each name in ["Hdr10", "Hdr10Plus", "HLG", "DolbyVision"]
        if display.DoesExist(name) then caps.hdr[name] = display[name]
    end for
    caps["videoMode"] = di.GetVideoMode()
    caps.model = di.GetModel()
    caps["modelName"] = di.GetModelDisplayName()
    caps["osVersion"] = di.GetOSVersion()
    caps.country = di.GetUserCountryCode()
    ' The app walks this address's subnet for servers, since it has no UDP broadcast.
    addrs = di.GetIPAddrs()
    for each name in addrs
        caps.ip = addrs[name]
        exit for
    end for
    return caps
end function
