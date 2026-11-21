/**
 * Logika murni pengiriman Push Notification DigiSwiss-Round.
 * Dipakai langsung oleh Code.gs di Google Apps Script (global scope)
 * dan dapat diimpor oleh Node.js (`node --test`) melalui module.exports.
 */

var PUSH_EVENT_TYPES = {
  ANNOUNCEMENT: 'announcement',
  ROUND_STARTED: 'round_started',
  SCORE_PENDING: 'score_pending',
  SCORE_DISPUTED: 'score_disputed',
  REGISTRATION_STATUS: 'registration_status'
};

var MAX_RATE_LIMIT_PER_MIN = 10;
var RATE_LIMIT_WINDOW_MS = 60 * 1000;
var FCM_BATCH_SIZE = 50;

function sanitizeText(value, maxLen) {
  var limit = typeof maxLen === 'number' && maxLen > 0 ? maxLen : 80;
  var clean = String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= limit) return clean;
  if (limit <= 3) return clean.slice(0, limit);
  return clean.slice(0, limit - 3).trim() + '...';
}

function sanitizePlayerName(name, maxLen) {
  var clean = sanitizeText(name, maxLen || 36);
  return clean || 'Pemain';
}

function isNotifEnabledForType(notifPrefs, pushType) {
  if (!notifPrefs || typeof notifPrefs !== 'object') {
    return true;
  }
  if (notifPrefs.enabled === false) {
    return false;
  }
  switch (pushType) {
    case PUSH_EVENT_TYPES.ANNOUNCEMENT:
      return notifPrefs.announcements !== false;
    case PUSH_EVENT_TYPES.ROUND_STARTED:
      return notifPrefs.rounds !== false;
    case PUSH_EVENT_TYPES.SCORE_PENDING:
    case PUSH_EVENT_TYPES.SCORE_DISPUTED:
      return notifPrefs.scores !== false;
    case PUSH_EVENT_TYPES.REGISTRATION_STATUS:
      return notifPrefs.registration !== false;
    default:
      return true;
  }
}

function checkAndConsumeRateLimit(cacheStore, callerUid, pushType, tournamentId, nowMs) {
  if (!callerUid || !pushType || !tournamentId) {
    return { allowed: false, remaining: 0 };
  }
  var now = typeof nowMs === 'number' ? nowMs : Date.now();
  var key = 'rl:' + callerUid + ':' + pushType + ':' + tournamentId;
  var raw = cacheStore && typeof cacheStore.get === 'function' ? cacheStore.get(key) : null;
  var state = null;
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch (e) {
      state = null;
    }
  }

  var count = 0;
  var windowStart = now;
  if (state && typeof state.windowStart === 'number' && typeof state.count === 'number') {
    if (now - state.windowStart < RATE_LIMIT_WINDOW_MS) {
      count = state.count;
      windowStart = state.windowStart;
    }
  }

  if (count >= MAX_RATE_LIMIT_PER_MIN) {
    return { allowed: false, remaining: 0 };
  }

  var nextCount = count + 1;
  var ttlSec = 120;
  if (cacheStore && typeof cacheStore.put === 'function') {
    cacheStore.put(
      key,
      JSON.stringify({ count: nextCount, windowStart: windowStart }),
      ttlSec
    );
  }

  return {
    allowed: true,
    remaining: Math.max(0, MAX_RATE_LIMIT_PER_MIN - nextCount)
  };
}

function isAuthorizedForPushType(params) {
  if (!params || !params.callerUid || !params.callerUser) return false;
  if (params.callerUser.active !== true) return false;

  var pushType = params.pushType;
  var callerUid = params.callerUid;
  var role = params.callerUser.role;
  var tournament = params.tournament;
  var match = params.match;

  if (!tournament) return false;

  if (
    pushType === PUSH_EVENT_TYPES.ANNOUNCEMENT ||
    pushType === PUSH_EVENT_TYPES.ROUND_STARTED ||
    pushType === PUSH_EVENT_TYPES.REGISTRATION_STATUS
  ) {
    return tournament.organizerId === callerUid || role === 'admin';
  }

  if (
    pushType === PUSH_EVENT_TYPES.SCORE_PENDING ||
    pushType === PUSH_EVENT_TYPES.SCORE_DISPUTED
  ) {
    if (!match) return false;
    return match.p1Id === callerUid || match.p2Id === callerUid;
  }

  return false;
}

function getPushRoundDisplayLabel(roundNum, tournament) {
  var totalSwiss = Number(tournament && tournament.totalRounds) || 3;
  var topCutSize = tournament && tournament.topCut && Number(tournament.topCut.size);
  if (!topCutSize || roundNum <= totalSwiss) {
    return 'Ronde ' + roundNum;
  }
  var offset = roundNum - totalSwiss;
  if (topCutSize === 8) {
    if (offset === 1) return 'Top 8 (Perempat Final)';
    if (offset === 2) return 'Top 4 (Semifinal)';
    if (offset === 3) return 'Final Top 8';
  }
  if (topCutSize === 4) {
    if (offset === 1) return 'Top 4 (Semifinal)';
    if (offset === 2) return 'Final Top 4';
  }
  return 'Babak ' + roundNum;
}

function buildPlayerUidLookup(players) {
  var byPid = {};
  if (!Array.isArray(players)) return byPid;
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    if (!p) continue;
    var pid = p.id || p.uid;
    var uid = typeof p.uid === 'string' ? p.uid.trim() : '';
    if (pid && uid) {
      byPid[pid] = {
        uid: uid,
        name: sanitizePlayerName(p.name, 36),
        status: p.status || 'waiting'
      };
    }
  }
  return byPid;
}

function resolveNotificationPlan(params) {
  var pushType = params.pushType;
  var callerUid = params.callerUid;
  var callerName = sanitizePlayerName(params.callerName, 36);
  var tournament = params.tournament || {};
  var tournamentId = params.tournamentId || tournament.id || '';
  var tourneyTitle = sanitizeText(tournament.name || 'Turnamen DigiSwiss', 52);
  var players = Array.isArray(params.players) ? params.players : [];
  var matches = Array.isArray(params.matches) ? params.matches : [];
  var match = params.match || null;
  var announcement = params.announcement || null;

  var items = [];
  var seenUids = {};

  function addRecipient(uid, title, body, matchId) {
    if (!uid || typeof uid !== 'string') return;
    var cleanUid = uid.trim();
    if (!cleanUid || cleanUid === callerUid || seenUids[cleanUid]) return;
    seenUids[cleanUid] = true;
    var entry = {
      recipientUid: cleanUid,
      title: String(title),
      body: String(body),
      type: pushType,
      tournamentId: String(tournamentId)
    };
    if (matchId) {
      entry.matchId = String(matchId);
    }
    items.push(entry);
  }

  if (pushType === PUSH_EVENT_TYPES.ANNOUNCEMENT) {
    var msgText = announcement && announcement.message
      ? sanitizeText(announcement.message, 120)
      : 'Ada pengumuman baru dari organizer.';
    var authorLabel = sanitizePlayerName(
      (announcement && announcement.authorName) || callerName,
      32
    );
    var annTitle = 'Pengumuman Baru • ' + tourneyTitle;
    var annBody = authorLabel + ': ' + msgText;

    for (var i = 0; i < players.length; i++) {
      var pl = players[i];
      if (!pl || !pl.uid || typeof pl.uid !== 'string') continue;
      if (pl.status === 'rejected' || pl.status === 'dropped') continue;
      addRecipient(pl.uid, annTitle, annBody);
    }
    return items;
  }

  if (pushType === PUSH_EVENT_TYPES.ROUND_STARTED) {
    var targetRound = Number(params.roundNumber || tournament.currentRound || 1);
    var roundLabel = getPushRoundDisplayLabel(targetRound, tournament);
    var playerLookup = buildPlayerUidLookup(players);
    var roundTitle = roundLabel + ' Dimulai • ' + tourneyTitle;

    for (var mIdx = 0; mIdx < matches.length; mIdx++) {
      var m = matches[mIdx];
      if (!m || m.archived === true) continue;
      if (Number(m.round) !== targetRound) continue;

      var tableNum = Number(m.table) || 1;
      var p1Info = playerLookup[m.p1Id];
      var p2Info = m.p2Id ? playerLookup[m.p2Id] : null;
      var p1Name = sanitizePlayerName(m.p1Name, 32);
      var p2Name = m.p2Id ? sanitizePlayerName(m.p2Name, 32) : '';

      if (p1Info && p1Info.uid) {
        var bodyP1 = m.p2Id
          ? 'Meja ' + tableNum + ' — Lawan: ' + p2Name
          : 'Meja ' + tableNum + ' — Anda mendapat BYE pada babak ini.';
        addRecipient(p1Info.uid, roundTitle, bodyP1, m.id);
      }

      if (m.p2Id && p2Info && p2Info.uid) {
        var bodyP2 = 'Meja ' + tableNum + ' — Lawan: ' + p1Name;
        addRecipient(p2Info.uid, roundTitle, bodyP2, m.id);
      }
    }
    return items;
  }

  if (pushType === PUSH_EVENT_TYPES.SCORE_PENDING) {
    if (!match || match.archived === true) return items;
    if (match.status !== 'awaiting') return items;

    var reporterId = match.reportedBy || callerUid;
    var opponentPid = reporterId === match.p1Id ? match.p2Id : match.p1Id;
    if (!opponentPid) return items;

    var lookupPending = buildPlayerUidLookup(players);
    var opponentInfo = lookupPending[opponentPid];
    var opponentUid = opponentInfo ? opponentInfo.uid : (opponentPid.indexOf('m_') === 0 ? '' : opponentPid);
    if (!opponentUid) return items;

    var reporterName = sanitizePlayerName(
      reporterId === match.p1Id ? match.p1Name : match.p2Name,
      32
    );
    var pendingTitle = 'Konfirmasi Skor • ' + tourneyTitle;
    var pendingBody =
      reporterName +
      ' melaporkan skor Meja ' +
      (Number(match.table) || 1) +
      ' (' +
      Number(match.p1Score || 0) +
      '-' +
      Number(match.p2Score || 0) +
      '). Silakan konfirmasi.';

    addRecipient(opponentUid, pendingTitle, pendingBody, match.id);
    return items;
  }

  if (pushType === PUSH_EVENT_TYPES.SCORE_DISPUTED) {
    if (!match || match.archived === true) return items;
    if (match.status !== 'disputed') return items;

    var organizerUid = typeof tournament.organizerId === 'string' ? tournament.organizerId.trim() : '';
    if (!organizerUid) return items;

    var p1Safe = sanitizePlayerName(match.p1Name, 24);
    var p2Safe = sanitizePlayerName(match.p2Name, 24);
    var disputedTitle = 'Skor Disengketakan • ' + tourneyTitle;
    var disputedBody =
      callerName +
      ' menyengketakan skor Meja ' +
      (Number(match.table) || 1) +
      ' (' +
      p1Safe +
      ' vs ' +
      p2Safe +
      ').';

    addRecipient(organizerUid, disputedTitle, disputedBody, match.id);
    return items;
  }

  if (pushType === PUSH_EVENT_TYPES.REGISTRATION_STATUS) {
    var ids = [];
    if (Array.isArray(params.targetPlayerIds)) {
      for (var k = 0; k < params.targetPlayerIds.length && ids.length < 100; k++) {
        if (typeof params.targetPlayerIds[k] === 'string' && params.targetPlayerIds[k].trim()) {
          ids.push(params.targetPlayerIds[k].trim());
        }
      }
    } else if (typeof params.targetPlayerId === 'string' && params.targetPlayerId.trim()) {
      ids.push(params.targetPlayerId.trim());
    }

    var playerById = {};
    for (var pIdx = 0; pIdx < players.length; pIdx++) {
      var candidate = players[pIdx];
      if (candidate && (candidate.id || candidate.uid)) {
        playerById[candidate.id || candidate.uid] = candidate;
      }
    }

    for (var tIdx = 0; tIdx < ids.length; tIdx++) {
      var targetId = ids[tIdx];
      var targetPlayer = playerById[targetId];
      if (!targetPlayer || !targetPlayer.uid || typeof targetPlayer.uid !== 'string') continue;

      if (targetPlayer.status === 'accepted') {
        addRecipient(
          targetPlayer.uid,
          'Pendaftaran Diterima • ' + tourneyTitle,
          'Pendaftaran Anda di ' + tourneyTitle + ' telah diterima oleh organizer.'
        );
      } else if (targetPlayer.status === 'rejected') {
        addRecipient(
          targetPlayer.uid,
          'Pendaftaran Ditolak • ' + tourneyTitle,
          'Maaf, pendaftaran Anda di ' + tourneyTitle + ' tidak dapat diterima.'
        );
      }
    }
    return items;
  }

  return items;
}

function filterNotificationPlanByPrefs(planItems, userDocsByUid) {
  if (!Array.isArray(planItems)) return [];
  var out = [];
  for (var i = 0; i < planItems.length; i++) {
    var item = planItems[i];
    if (!item || !item.recipientUid) continue;
    var uDoc = userDocsByUid ? userDocsByUid[item.recipientUid] : null;
    if (uDoc && uDoc.active === false) continue;
    var prefs = uDoc ? uDoc.notifPrefs : null;
    if (!isNotifEnabledForType(prefs, item.type)) continue;
    out.push(item);
  }
  return out;
}

function chunkArray(arr, size) {
  var chunkSize = typeof size === 'number' && size > 0 ? size : FCM_BATCH_SIZE;
  var result = [];
  if (!Array.isArray(arr) || arr.length === 0) return result;
  for (var i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

function buildFcmDataMessage(token, item) {
  var dataPayload = {
    title: String(item.title || 'DigiSwiss-Round'),
    body: String(item.body || ''),
    type: String(item.type || ''),
    tournamentId: String(item.tournamentId || '')
  };
  if (item.matchId) {
    dataPayload.matchId = String(item.matchId);
  }
  return {
    message: {
      token: String(token),
      data: dataPayload,
      android: {
        priority: 'HIGH'
      }
    }
  };
}

function shouldDeleteTokenForFcmResponse(statusCode, bodyObj) {
  if (statusCode === 404 || statusCode === 410) return true;
  if (!bodyObj || !bodyObj.error) return false;

  var err = bodyObj.error;
  if (err.status === 'NOT_FOUND') return true;

  var msg = String(err.message || '').toUpperCase();
  if (msg.indexOf('UNREGISTERED') !== -1 || msg.indexOf('NOT_FOUND') !== -1) {
    return true;
  }

  if (Array.isArray(err.details)) {
    for (var i = 0; i < err.details.length; i++) {
      var d = err.details[i];
      if (d && (d.errorCode === 'UNREGISTERED' || d.errorCode === 'NOT_FOUND')) {
        return true;
      }
    }
  }
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PUSH_EVENT_TYPES: PUSH_EVENT_TYPES,
    MAX_RATE_LIMIT_PER_MIN: MAX_RATE_LIMIT_PER_MIN,
    RATE_LIMIT_WINDOW_MS: RATE_LIMIT_WINDOW_MS,
    FCM_BATCH_SIZE: FCM_BATCH_SIZE,
    sanitizeText: sanitizeText,
    sanitizePlayerName: sanitizePlayerName,
    isNotifEnabledForType: isNotifEnabledForType,
    checkAndConsumeRateLimit: checkAndConsumeRateLimit,
    isAuthorizedForPushType: isAuthorizedForPushType,
    getPushRoundDisplayLabel: getPushRoundDisplayLabel,
    resolveNotificationPlan: resolveNotificationPlan,
    filterNotificationPlanByPrefs: filterNotificationPlanByPrefs,
    chunkArray: chunkArray,
    buildFcmDataMessage: buildFcmDataMessage,
    shouldDeleteTokenForFcmResponse: shouldDeleteTokenForFcmResponse
  };
}
