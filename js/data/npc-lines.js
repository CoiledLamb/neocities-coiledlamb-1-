/* ==============================================
   THE LONG HAUL — NPC dialogue corpus

   ~75 lines spanning thresholds, ambient chatter,
   warnings, route previews, and rest prompts for
   the three depot NPCs (rho/iota/tau).

   Verbatim extract from main.js (commit 3 / SHA 077f9e8).
   No behavior change.
   ============================================== */
'use strict';

export const NPC_LINES = {
  threshold: {
    'A': {
      20:  'good. been watching you. try the road west when you can.',
      40:  'when the sky goes the colour of zinc, you turn back. tell yourself i said so.',
      60:  'i keep the manifest in my head now. ask before you leave and i\'ll tell you what\'s out there.',
      80:  'door\'s open, porter. fire\'s lit. you sit when you need to sit.',
    },
    'B': {
      20:  'oh — hey! you\'re the one walking the loop! i can point you somewhere new if you want.',
      40:  'rain on the way? i can usually feel it. ask me at the door, i\'ll tell you straight.',
      60:  'i see the packages stacked here before they go out. you want a tip? just ask.',
      80:  'we built the bunk. it\'s yours when you\'re here. don\'t make it weird, just sleep.',
    },
    'H': {
      20:  'i remember your callsign now. that means something. keep coming back.',
      40:  'if you\'re tired or hurt or the weather\'s wrong, i\'ll say so. that\'s the deal.',
      60:  'people leave parcels here on their way through. i can tell you what\'s waiting up the line.',
      80:  'home is home. when you\'re here, you\'re here. eat. sleep. start again.',
    },
  },
  ambient: {
    'A': [
      'wind\'s shifted. mind your hat.',
      'the road keeps. the road forgets.',
      'someone walked through last night. didn\'t stop.',
      'kettle\'s on if you\'re passing.',
      'we don\'t count the days here.',
      'sky was that yellow this morning. you know the one.',
    ],
    'B': [
      'roof patched! a real roof! finally!',
      'do you know who left the seeds? thank them, if you see them.',
      'i tried to follow the stars last night. couldn\'t.',
      'somebody whistled past at dawn. it was you, wasn\'t it?',
      'we\'re going to plant something next season. anything that\'ll take.',
      'the radio crackles when you\'re close. funny.',
    ],
    'H': [
      'come in, dry off, sit a while.',
      'the kettle remembers you.',
      'your boots have a sound. i hear them before i see you.',
      'someone left a photograph here. i\'ll keep it for them.',
      'the dog stayed up listening for you. she does that.',
      'old porter\'s rest — always a chair by the door.',
    ],
  },
  warning: {
    'A': {
      rain:    'sky\'s gonna open inside the hour. lean into it or wait it out.',
      trip:    'next leg eats boots. i\'ve seen it. mind your step.',
      stamina: 'you\'re running on empty, porter. drink before you push.',
    },
    'B': {
      rain:    'oh — rain! get a hood up, it\'s coming!',
      trip:    'careful out there, the path beyond is bad. real bad.',
      stamina: 'you look wiped. drink something before you go!',
    },
    'H': {
      rain:    'rain\'s walking up the valley. you\'ll meet it if you go now.',
      trip:    'the road ahead has bones in it. take it slow.',
      stamina: 'sit a beat. you\'ll fall if you walk like that.',
    },
  },
  preview: {
    'A': '{kind} parcel waiting up the line at {next}. you\'ll want the slot.',
    'B': 'oh! there\'s a {kind} package toward {next}! grab the room for it!',
    'H': '{kind} bundle headed for {next}. travels well in the right hands.',
  },
  rest: {
    'A': [
      'sit. boots off. there.',
      'kettle\'s yours. take what you need.',
      'i\'ll wake you when the light changes.',
    ],
    'B': [
      'oh, good — take the bunk! it\'s real soft, i swear!',
      'the dog will sit at your feet, just so you know!',
      'sleep, sleep — i\'ll watch the door!',
    ],
    'H': [
      'home is home. close your eyes.',
      'rest. nothing\'s going anywhere without you.',
      'i\'ll keep the fire — you keep your strength.',
    ],
  },
};
