/* ==============================================
   THE LONG HAUL — NPC dialogue corpus

   Six NPCs (v0.0.8.4 added phi/xi/psi to the original
   rho/iota/tau). Shape is CATEGORY-FIRST:
     NPC_LINES.threshold[depotId][20|40|60|80]  single string per tier
     NPC_LINES.ambient[depotId]                 array (~5\u20136)
     NPC_LINES.warning[depotId].{rain|trip|stamina}  arrays (3\u20135)
     NPC_LINES.preview[depotId]                 array of templates
                                                using {label}/{size}/{dest}
     NPC_LINES.rest[depotId]                    array (3\u20134)

   v0.0.8.4: warning and preview promoted from single strings to arrays
     so trust.js's pickRandom() actually has variety to pick from. Old
     shape silently no-opped because trust.js accessed ID-first while
     data was category-first \u2014 this entire corpus was invisible in-game
     except for ambient chatter. See trust.js header for details.

   Voices:
     rho  (A) former porter, experienced and settled. laconic. gives
              wizened advice from their years on the route.
     iota (B) young (20s) wetlands ecology researcher. eager,
              exclamatory. works on sustainable farming techniques.
     tau  (H) your sibling. protective, close, your only real family.
              a finger on the trigger, a hand on your heart.
     phi  (?) weather station, measured, meteorological authority
     xi   (C) reserved researcher in ruins, clipped, warms slowly
     psi  (\u00b7) orphan-scavenger at waypoint. resilient, self-sufficient,
              warm but not fragile. survives alone in the waste. collects.
   ============================================== */
'use strict';

export const NPC_LINES = {
  threshold: {
    'A': {
      20:  'you walk the way i used to. that\'s not flattery. try the road west when you can.',
      40:  'when the sky goes the colour of zinc, you turn back. i lost a season to that colour once.',
      60:  'i used to run this route in my head while i slept. i can tell you what\'s out there.',
      80:  'door\'s open, porter. fire\'s lit. you sit when you need to sit. i know what tired looks like.',
    },
    'B': {
      20:  'oh \u2014 hey! you\'re out on the route! i\'ve been wanting to ask \u2014 have you seen the soil past the marsh edge?',
      40:  'i\'m tracking the rainfall patterns here. if the weather shifts, i\'ll know before anyone. ask me.',
      60:  'the seed manifests come through here before dispatch. i can tell you what\'s staged on the next leg.',
      80:  'the bunk\'s behind the drying racks. it\'s yours. the research doesn\'t sleep, but you should.',
    },
    'H': {
      20:  'you came back. \u2014 good. i knew you would.',
      40:  'you\'re getting the hang of this. if the weather turns or the road gets rough, i\'ll let you know.',
      60:  'i\'ve been watching the route. i can tell you what\'s staged ahead \u2014 you\'ve earned that.',
      80:  'you\'ve done more than enough today. this is your home. rest when you\'re ready.',
    },
    '?': {
      20:  'station\'s noted you. take shelter here if a front comes quick.',
      40:  'let me read you the sky before you go. it saves boots.',
      60:  'incoming cargo posts up at the door when the wind\'s right. i\'ll tell you what\'s coming.',
      80:  'stay the night if the weather calls for it. roof\'s sound.',
    },
    'C': {
      20:  'state your business. you\'re welcome to step inside. briefly.',
      40:  'you handle fragile work well. i\'ve noticed. not everyone does.',
      60:  'if the stones have something you should know, i\'ll mention it.',
      80:  'there\'s a cot. the dust isn\'t bad. you\'re allowed.',
    },
    '\u00b7': {
      20:  'hey. \u2014 you\'re the one who\'s been walking past. thanks for stopping.',
      40:  'you keep coming back. i appreciate that. most don\'t.',
      60:  'i see a lot from here. i can tell you what\'s moving on the route if you want.',
      80:  'there\'s room here if you need it. the stone keeps the wind off.',
    },
    // v0.0.9.5 new 6 — stubs. Real threshold lines land in commits 2-3.
    '\u03bd':  {},  // nu
    '\u03b8':  {},  // theta
    '\u03b3':  {},  // gamma
    '\u03bb':  {},  // lambda
    '\u03c0':  {},  // pi
    '\u03b4':  {},  // delta
  },

  ambient: {
    'A': [
      'wind\'s shifted. mind your hat.',
      'the road keeps. the road forgets. i did both.',
      'someone walked through last night. didn\'t stop. i remember doing that.',
      'kettle\'s on if you\'re passing. i always wished someone had one going.',
      'i stopped counting the days a long time ago.',
      'i can tell by the sound of your boots whether you need a break.',
    ],
    'B': [
      'the germination rates are up this cycle! finally!',
      'do you know who left the seed packet? i need to know the cultivar.',
      'i\'m mapping the root networks in the wetland margin. it\'s beautiful down there.',
      'somebody whistled past at dawn. it was you, wasn\'t it?',
      'this season\'s trial plot is reed-barley. if it takes, we eat different next year.',
      'the water table\'s shallow here. that\'s the whole thesis, really.',
    ],
    'H': [
      'the kettle\'s the same one. you remember.',
      'the dog waited up for you again. she only does that for you.',
      'i kept your boots by the door. where you left them.',
      'found a photograph of us. old one. it\'s on the shelf now.',
      'i can hear your footsteps before the door. always could.',
      'the chair by the door is still yours. always will be.',
    ],
    '?': [
      'the pressure\'s been falling since noon.',
      'cloud ceiling\'s lower today. mark it.',
      'the anemometer squeaks. i like that sound.',
      'third gust of the hour. it\'s building.',
      'rain comes on a northwest line here. always has.',
      'you can taste a storm before you see it. lesson one.',
    ],
    'C': [
      'the walls remember more than they say.',
      'pulled a copper fitting from the south pile this morning. still functions.',
      'silence here is not empty. it\'s archived.',
      'field log \u2014 entry seventeen. nothing conclusive.',
      'every stone has a year on it, if you know how to look.',
      'someone built this. that\'s the question i keep coming back to.',
    ],
    '\u00b7': [
      'found a copper fitting in the road yesterday. still good.',
      'i sort everything into boxes. keeps things findable.',
      'a porter passed through at dawn. didn\'t stop. most don\'t.',
      'if you find something shiny, i\'ll trade you something smooth.',
      'the waypoint\'s mine. i take care of it.',
      'small things last longer than big things, mostly.',
    ],
    // v0.0.9.5 new 6 — stubs. Real ambient chatter lands in commits 2-3.
    '\u03bd':  [],  // nu
    '\u03b8':  [],  // theta
    '\u03b3':  [],  // gamma
    '\u03bb':  [],  // lambda
    '\u03c0':  [],  // pi
    '\u03b4':  [],  // delta
  },

  warning: {
    'A': {
      rain: [
        'sky\'s gonna open inside the hour. lean into it or wait it out.',
        'rain\'s coming. i can smell it \u2014 could always smell it. you\'ve got a window.',
        'i walked through a front like this once. carry a hood. trust me.',
        'the birds went quiet. learned that tell on the route, long time ago.',
      ],
      trip: [
        'next leg eats boots. i\'ve seen it. walked it enough times myself.',
        'bad footing out past the bend. i lost a delivery there once.',
        'the ground out there isn\'t what it looks like. trust an old porter on that.',
        'porters come back limping from that stretch. i was one of them, once.',
      ],
      stamina: [
        'you\'re running on empty, porter. i know the look. drink before you push.',
        'sit a minute. the road\'ll keep. it kept for me.',
        'you push that low and you\'ll pay for it. i\'ve paid.',
        'you\'re not right. i can see it. take a breath before you go.',
      ],
    },
    'B': {
      rain: [
        'oh \u2014 rain! the soil samples! \u2014 i mean, you! get a hood up!',
        'the humidity curve just spiked! storm\'s right there!',
        'hood up hood up \u2014 the rain here carries nutrients but also, you know, cold!',
        'rain incoming! good for the plots, bad for walking!',
      ],
      trip: [
        'careful \u2014 the substrate past the marsh is unstable. i\'ve taken core samples, it\'s bad.',
        'oh \u2014 please be careful, the root mat on that leg is so slippery!',
        'the ground past here is waterlogged clay. it looks solid but it shears.',
        'someone slipped there last week \u2014 the mycelium layer\'s like ice when it\'s wet!',
      ],
      stamina: [
        'you look wiped. drink something \u2014 electrolytes matter!',
        'please rest a minute! your output will be better for it, i promise!',
        'you\'ll fall on your face! sit, sit \u2014 i have filtered water!',
        'hydrate, hydrate, please \u2014 dehydration compounds!',
      ],
    },
    'H': {
      rain: [
        'rain\'s coming up the valley. you\'ll want the hood.',
        'wind\'s carrying wet. plan for it.',
        'look east. see that? hood at minimum. you\'ll be fine.',
        'weather\'s turning. just making sure you know.',
      ],
      trip: [
        'rough stretch ahead. you know what to do.',
        'careful on that leg. \u2014 you\'ve handled worse, but still.',
        'watch your step out there. that leg\'s got teeth.',
        'bad footing ahead. trust your boots.',
      ],
      stamina: [
        'sit down. eat something. you\'ve earned a rest.',
        'you\'re pushing hard. take a minute \u2014 the route\'ll keep.',
        'you look like you need a break. no shame in that.',
        'drink. eat. then go. \u2014 you\'ll go further for it.',
      ],
    },
    '?': {
      rain: [
        'the front\'s two ridges out. twenty minutes, give or take.',
        'isobars are stacking. it\'ll be a fast rain \u2014 plan short.',
        'pressure dropped three points. you\'ll be wet before the hour\'s up.',
        'sky\'s rotating the wrong way. turn back or hunker.',
        'my instruments say rain. the instruments are rarely wrong.',
      ],
      trip: [
        'soil saturates out past the bend \u2014 unreliable footing.',
        'cross-winds on the next leg knock porters over. i\'ve watched it.',
        'water\'s still sitting in those hollows. slow walking.',
        'the stones sweat in this weather. every one a skid.',
      ],
      stamina: [
        'heat like this eats porters. you need water and a chair.',
        'weather\'s working against you. rest before you move.',
        'humidity\'s at a punishing number. drink.',
        'you\'re the unhealthiest reading on my barometer. sit.',
      ],
    },
    'C': {
      rain: [
        'rain will come. the stones weep first \u2014 watch them.',
        'barometer here reads dropping. inside is dry.',
        'weather\'s turning. i keep the inner chamber lit.',
        'you won\'t outrun what\'s coming. shelter here is offered.',
      ],
      trip: [
        'the path beyond isn\'t sound. i\'ve catalogued three collapses.',
        'foundation stones shift in that stretch. step lightly.',
        'i\'ve mapped the weak points. you won\'t. walk slow.',
        'porters fall there. i\'ve logged them. don\'t be another.',
      ],
      stamina: [
        'your pulse is poor. drink. sit.',
        'you won\'t help anyone collapsed. rest is owed.',
        'the ruin offers shade. take it.',
        'you look like you\'ve been through a season. pause.',
      ],
    },
    '\u00b7': {
      rain: [
        'rain\'s close. the stones get damp before it hits \u2014 learned that the hard way.',
        'cold in the air. that\'s the rain smell. you\'ll want a hood.',
        'sky\'s heavy. i\'d wait, but you probably won\'t.',
        'my pebbles are damp. means rain. \u2014 sounds weird. it works.',
      ],
      trip: [
        'that stretch bites. watch the loose stones.',
        'the ground past the bend lies about being flat. i\'ve fallen there.',
        'bad footing ahead. i don\'t go that way without watching every step.',
        'porters come back scraped from that leg. go slow.',
      ],
      stamina: [
        'you look empty. drink something. the road doesn\'t wait for tired people.',
        'sit. eat. \u2014 i mean it. you won\'t make it like that.',
        'you\'re running on nothing. i know what that looks like.',
        'rest here. i\'ve got water. take some.',
      ],
    },
    // v0.0.9.5 new 6 — warning stubs. Full sets land in commits 2-3.
    // Empty rain/trip/stamina arrays prevent trust.js warn access from
    // throwing on `undefined.trip` (pickRandom([]) → undefined → speak no-op).
    '\u03bd':  { rain: [], trip: [], stamina: [] }, // nu
    '\u03b8':  { rain: [], trip: [], stamina: [] }, // theta
    '\u03b3':  { rain: [], trip: [], stamina: [] }, // gamma
    '\u03bb':  { rain: [], trip: [], stamina: [] }, // lambda
    '\u03c0':  { rain: [], trip: [], stamina: [] }, // pi
    '\u03b4':  { rain: [], trip: [], stamina: [] }, // delta
  },

  preview: {
    'A': [
      '{size} {label} waiting up the line. headed for {dest}. save the slot \u2014 i would.',
      'heard about a {label} out that way \u2014 bound for {dest}. {size}, they said.',
      'there\'s a {label} on the road. {dest} wants it. i\'d have grabbed it in my day.',
      '{label} out past the bend. {size}. that\'s a good carry.',
    ],
    'B': [
      'oh! there\'s a {size} {label} out toward {dest} \u2014 grab the room!',
      'package alert! {label} on the next leg, for {dest}!',
      'i logged a {label} \u2014 it\'s {size}! going to {dest}, i think!',
      'keep eyes open! a {label} out there waiting for {dest}!',
    ],
    'H': [
      '{size} {label} on the next leg \u2014 for {dest}. it\'s a good carry.',
      'a {label} out that way. {dest}\'s been waiting. go grab it.',
      'someone left a {label} on the road. {size}. {dest}\'s. you\'ve got this.',
      '{label} coming up the line. {dest} will be glad of it. \u2014 so will i.',
    ],
    '?': [
      'weather\'s holding. the {size} {label} on the next leg can go out \u2014 {dest} expects it.',
      'a {label} is cleared for delivery. {dest}. {size}. conditions are fair.',
      'porter \u2014 {size} {label}, bound for {dest}. window\'s open.',
      'station log: {label} staged for {dest}. the air\'s right for it.',
      'if you\'re routing toward {dest}, a {label} needs the carry.',
    ],
    'C': [
      '{size} {label} staged for {dest}. handle it with care.',
      'outbound: a {label}. {dest}. if you can take it, take it properly.',
      'the {label} is fragile in its way. {size}. {dest}.',
      'catalogued a {label} on the next leg. {dest}\'s, nominally.',
      'i note a {size} {label} bound for {dest}. precision matters.',
    ],
    '\u00b7': [
      'there\'s a {size} {label} on the next stretch. for {dest}. \u2014 take it if you can.',
      'someone left a {label} out there. {dest}\'s. i\'d have grabbed it but i don\'t leave the waypoint much.',
      'a {label} on the road \u2014 {size}. {dest} probably wants it.',
      'if you pass a {label}, it\'s headed for {dest}. looks like a decent carry.',
    ],
    // v0.0.9.5 new 6 — preview stubs. Real preview templates in commits 2-3.
    '\u03bd':  [], '\u03b8':  [], '\u03b3':  [],
    '\u03bb':  [], '\u03c0':  [], '\u03b4':  [],
  },

  rest: {
    'A': [
      'sit. boots off. i know the ritual.',
      'kettle\'s yours. take what you need. it\'s what i needed.',
      'i\'ll wake you when the light changes. someone did that for me once.',
      'no hurry. the route\'s patient. i learned that the hard way.',
    ],
    'B': [
      'oh, good \u2014 take the bunk! it smells like dried reeds but it\'s comfy!',
      'the lab\'s quiet at night. you\'ll sleep great, promise!',
      'sleep, sleep \u2014 i\'ll be up cataloguing, but i\'ll be quiet!',
      'there\'s a warm spot by the drying racks \u2014 i\'ll set you up!',
    ],
    'H': [
      'sleep. i\'ll be here when you wake up.',
      'fire\'s on. like always.',
      'rest. you\'ve earned it today.',
      'you\'re home. that\'s enough.',
    ],
    '?': [
      'the cot\'s in the back. i\'ll watch the gauges.',
      'front\'s a few hours off. sleep. i\'ll wake you when it turns.',
      'rest. i read the sky so you don\'t have to.',
      'quiet night by the readings. take it while you can.',
    ],
    'C': [
      'the cot\'s clean. i\'ll be reading.',
      'sleep. i keep the lantern trimmed low.',
      'the ruin doesn\'t mind guests. rest.',
      'i don\'t sleep much myself. you have the room.',
    ],
    '\u00b7': [
      'blanket\'s clean. stone blocks the wind. it\'s not bad.',
      'you can stay. i\'ll be quiet.',
      'spot by the big stone is the warmest. \u2014 i tested them all.',
      'stay if you want. candles are on anyway.',
    ],
    // v0.0.9.5 new 6 — rest stubs. Real rest lines in commits 2-3.
    '\u03bd':  [], '\u03b8':  [], '\u03b3':  [],
    '\u03bb':  [], '\u03c0':  [], '\u03b4':  [],
  },

  // v0.0.8.4: delivery-complete lines. Fire once per delivery batch via
  // speakDelivery() in trust.js. No trust gate \u2014 NPCs react from the
  // very first delivery. Condition priority: lost > damaged > fragile > heavy > normal.
  delivery: {
    'A': {
      normal: [
        'received. solid run.',
        'that\'s the job done. good.',
        'logged it. kettle\'s there if you want it.',
      ],
      heavy: [
        'that\'s a real haul. i remember those. respect.',
        'big carry. you\'ve got the shoulders for it.',
        'heavy load like that \u2014 i\'d have needed two trips in my day.',
      ],
      damaged: [
        'it\'s roughed up. i\'ve delivered worse. it counts.',
        'scrip\'s lighter on that one. happens. the road does what it does.',
        'banged up, but here. that\'s what matters.',
      ],
      fragile: [
        'fragile, and not a scratch. nice hands.',
        'careful work. i always respected careful work.',
        'brought it in clean. that takes discipline.',
      ],
      lost: [
        'someone lost that. you found it. that\'s the route working.',
        'recovered cargo. good eyes. i\'ve found a few in my time.',
        'that was sitting out there waiting. glad someone picked it up.',
      ],
    },
    'B': {
      normal: [
        'oh \u2014 thank you! this is exactly what we needed!',
        'yes! package! the plots are going to love this!',
        'another delivery, another data point! thanks!',
      ],
      heavy: [
        'oh my god, that\'s enormous! how did you carry that!',
        'that\'s \u2014 wow. that\'s a LOT. thank you!',
        'the big ones make the biggest difference! you\'re amazing!',
      ],
      damaged: [
        'oh no \u2014 is it okay? are YOU okay?',
        'it\'s a little banged up but \u2014 the contents should be fine. probably. hopefully!',
        'don\'t worry about it! field conditions, right? i know all about field conditions!',
      ],
      fragile: [
        'fragile and perfect! your technique is sound!',
        'not a crack, not a bend \u2014 that\'s publishable handling quality!',
        'you brought it in pristine! i\'m writing that down!',
      ],
      lost: [
        'oh! this was LOST? and you FOUND it? that\'s incredible!',
        'someone dropped this out there \u2014 you recovered it! field recovery!!',
        'wait, this is salvaged cargo? the data on recovery rates alone \u2014 thank you!',
      ],
    },
    'H': {
      normal: [
        'good run. \u2014 look at you.',
        'another one down. nice work.',
        'i saw you coming up the road. you looked good out there.',
      ],
      heavy: [
        'that was a big carry. \u2014 well done.',
        'heavy load. you handled it.',
        'that\'s serious weight. i\'m impressed.',
      ],
      damaged: [
        'rough trip. it happens. \u2014 you still got it here.',
        'banged up, but delivered. that\'s what counts.',
        'the road took a piece. you brought the rest. that\'s enough.',
      ],
      fragile: [
        'fragile, and clean. nice work.',
        'not a scratch. you\'ve got steady hands.',
        'brought it in perfect. \u2014 yeah. that\'s my family.',
      ],
      lost: [
        'you found someone\'s lost cargo and brought it in. of course you did.',
        'recovered. \u2014 that\'s the kind of porter you are.',
        'lost and found. that takes heart.',
      ],
    },
    '?': {
      normal: [
        'delivery logged. conditions at time of arrival: fair.',
        'received and shelved. thank you, porter.',
        'package accounted for. the station appreciates the carry.',
      ],
      heavy: [
        'significant payload. your route efficiency is noted.',
        'heavy carry across that terrain. impressive logistics.',
        'large delivery in good time. the station logs that.',
      ],
      damaged: [
        'condition: compromised. weather factors, presumably.',
        'noted the damage. it happens when the pressure systems shift.',
        'scrip adjustment recorded. the instruments took worse last season.',
      ],
      fragile: [
        'fragile cargo, intact on arrival. precision delivery.',
        'delicate contents, no deviation. good atmospheric window for it.',
        'intact fragile. i\'ll note the handling conditions in the log.',
      ],
      lost: [
        'this was unaccounted for in the manifest. interesting anomaly.',
        'recovered cargo \u2014 i\'ll log the coordinates and conditions.',
        'lost delivery retrieved. the route self-corrects, given time.',
      ],
    },
    'C': {
      normal: [
        'received.',
        'noted. put it by the wall.',
        'acceptable. \u2014 thank you.',
      ],
      heavy: [
        'that\'s substantial. you carried that through the ruins approach?',
        'heavy. i wouldn\'t have attempted that path with this weight. well done.',
        'significant cargo. i\'ll make use of it.',
      ],
      damaged: [
        'damaged. the path does that. i\'ve catalogued the hazards \u2014 not that it helps.',
        'condition\'s poor. scrip reflects it. the contents may still serve.',
        'you tripped. i can tell. the approach here is unkind.',
      ],
      fragile: [
        'fragile, and intact. that\'s \u2014 that\'s good work.',
        'you carried that through the approach without damage. genuinely impressed.',
        'careful handling. i notice that. most don\'t manage it.',
      ],
      lost: [
        'this was lost? where did you find it? \u2014 the provenance matters.',
        'recovered cargo. interesting. i\'d like to know the drop location.',
        'someone left this behind. the ruins collect things. so do i.',
      ],
    },
    '\u00b7': {
      normal: [
        'thanks. \u2014 this is good.',
        'you brought something. i appreciate it.',
        'got it. i\'ll find a spot for it.',
      ],
      heavy: [
        'that\'s a big carry for one person. \u2014 respect.',
        'you hauled all that? i\'m impressed. genuinely.',
        'heavy load. you didn\'t have to, but you did.',
      ],
      damaged: [
        'it\'s a bit rough. doesn\'t matter \u2014 it\'s here.',
        'the road did a number on it. i can work with this.',
        'banged up. \u2014 you okay, though?',
      ],
      fragile: [
        'fragile, and whole. you\'re careful. i like that.',
        'not a mark on it. takes skill to carry fragile things this far.',
        'you kept it safe the whole way. \u2014 thank you.',
      ],
      lost: [
        'this was lost out there? and you brought it in? \u2014 that matters.',
        'a lost thing, found. \u2014 i understand that more than most.',
        'someone dropped this and you picked it up. good.',
      ],
    },
    // v0.0.9.5 new 6 — delivery stubs. Real delivery lines in commits 2-3.
    // `speakDelivery()` safely falls back when condition arrays are empty
    // or the entry is missing entirely (see trust.js:115).
    '\u03bd':  {}, // nu
    '\u03b8':  {}, // theta
    '\u03b3':  {}, // gamma
    '\u03bb':  {}, // lambda
    '\u03c0':  {}, // pi
    '\u03b4':  {}, // delta
  },
};
