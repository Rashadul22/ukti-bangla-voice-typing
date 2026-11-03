// Ukti - Banglish (romanised Bangla) to Bangla script.
//
// Rule-based phonetic transliteration, Avro-style, plus a dictionary of
// common words that pure phonetic rules get wrong. Runs fully offline.
//
// v1 is approximate by design. The accurate path is a large lookup table
// built from the Dakshina lexicon; that is planned for a later version.

(function () {
  'use strict';

  // Everything below is built on first use, not on load. This file runs in
  // every frame of every page, including ad iframes that never hold a text
  // box, and building the dictionary there cost each of them heap for
  // nothing. The body keeps its original indentation so its history stays
  // readable; it is the inside of build().
  function build() {

  const HASANTA = '্';

  // Banglish writers mix English in constantly ("amar computer e", "ekta
  // screenshot dibo"). Transliterating those produces nonsense, so known
  // English words are passed through untouched.
  const ENGLISH = new Set(`
    a the and or but if then than that this these those is was were be
    been being do does did done have has had will would can could should
    shall may might must not no yes of in on at to for from by with without
    about into over under again more most some any all each every other such
    only own same so too very just now here there when where why how what
    which who whom whose
    i you he she it we they me him her us them my your his its our their mine
    ok okay please thanks thank sorry hello hi bye pen pencil paper
    think thinks thinking thought problem problems internet camera
    translate translation translator convert converter voice speech
    record recording microphone mic language languages keyboard typing
    shirt sheet shape shapes sharp sheets fastest faster
    printer speaker monitor router network server client cloud backup
    battery charger keyboard headphone earphone bluetooth
    tool tools file files folder link links site website web page pages app
    apps software hardware computer laptop mobile phone screen screenshot
    screenshots type typing text message messages email mail password login
    logout signup account profile setting settings update upgrade install
    download upload share post comment like follow video photo photos image
    images audio music play pause stop start click button menu search filter
    data database server client browser chrome firefox edge safari window tab
    tabs extension plugin code coding program programming project projects
    design designer develop developer version release build test testing bug
    bugs fix error errors feature features
    google facebook youtube instagram whatsapp twitter gmail zoom meet skype
    telegram linkedin github openai chatgpt gemini claude
    office meeting class classes exam exams result results assignment
    semester university college school teacher student course lecture note
    notes report presentation
    doctor hospital clinic medicine bank account number card payment order
    delivery address shipping price cost discount offer market shop store
    time date day week month year today tomorrow morning evening night
    team group company business job work office client customer manager boss
    sir madam
    good bad best better nice great cool fine done ready new old free paid
    open close save load send receive
    already always also because before after between during through while
    since until maybe really actually probably usually sometimes never ever
    still even much many few little big small long short high low first last
    next previous different important possible difficult easy hard simple
    complete correct wrong true false enough almost together another both
    pdf doc docx excel word powerpoint png jpg mp3 mp4 url api ml html css
    javascript python java php sql json
    love miss help delete money online status train bus bike hotel burger
    gift song game football match player sad tired late sure brother sister
    uncle bro dude plan point issue system font paste print submit messenger
    imo chat call cash cake car cut copy restaurant birthday honey
  `.trim().split(/\s+/));

  // A word list alone is far too small to recognise English prose, so
  // spelling patterns carry most of the weight. These shapes are common in
  // English and almost absent from romanised Bangla.
  // Shapes that settle it on their own. These appear in English and
  // essentially never in romanised Bangla.
  const ENGLISH_STRONG = [
    /(?:tion|sion|ment|ness|able|ible|ology|ically|ance|ence|ious|eous)$/,
    /ck|ght|ph(?![aeiou])|wh|qu/,     // quick, night, graph, when
    /ea|oa|ie/,                       // read, boat, field
    // A doubled consonant. c is left out because Banglish writes cch for
    // চ্ছ (icche, jacchi); the bare-c rule below catches coffee anyway.
    /([bdfgmprtz])\1/,                // matter, bubble
    // Banglish uses c almost only inside ch and cch. A c before anything
    // else is English: car, cake, copy, cancel, picture.
    /c(?![ch])/,
    // A consonant then a final y: family, reply, party, copy. Banglish ends
    // a word in y only after a vowel (kothay, hoy, chay).
    /[^aeiouy]y$/
  ];

  // Shapes that only hint. Two of them, or one plus a long word, is enough.
  // Kept separate because each of these also fits plenty of Bangla:
  // "thanda", "shomoy" and "shundor" all open the way English does, and
  // "dekhei" and "duita" carry vowel pairs English likes.
  const ENGLISH_WEAK = [
    /(?:ing|ed|ly|est)$/,             // helped, quickly, fastest
    /^(?:th|wr|kn|sc|sp|st|sh)[aeiou]/,
    /ei|ui/
  ];

  function looksEnglish(word) {
    const lower = word.toLowerCase();
    if (ENGLISH.has(lower)) return true;
    // Anything the Bangla dictionary claims is Bangla, whatever it looks like.
    if (hasKey(COMMON, lower)) return false;
    // Acronyms people type in caps: API, PDF, HTML.
    if (word.length >= 2 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
      return true;
    }
    // q, w and x almost never appear in romanised Bangla.
    if (/[qwx]/.test(lower)) return true;
    if (lower.length < 3) return false;

    for (const shape of ENGLISH_STRONG) if (shape.test(lower)) return true;

    let weak = 0;
    for (const shape of ENGLISH_WEAK) if (shape.test(lower)) weak++;
    return weak >= 2 || (weak === 1 && lower.length >= 9);
  }

  // Words people type constantly where phonetic rules give the wrong letter
  // (mostly the t/T and d/D retroflex distinction that nobody types).
  const COMMON = {
    ami: 'আমি', amar: 'আমার', amake: 'আমাকে', amader: 'আমাদের',
    tumi: 'তুমি', tomar: 'তোমার', tomake: 'তোমাকে', tomader: 'তোমাদের',
    apni: 'আপনি', apnar: 'আপনার', apnake: 'আপনাকে',
    se: 'সে', tar: 'তার', tara: 'তারা', ora: 'ওরা', amra: 'আমরা',
    ekta: 'একটা', ekti: 'একটি', duita: 'দুইটা', duto: 'দুটো',
    kichu: 'কিছু', kichui: 'কিছুই', sob: 'সব', sobai: 'সবাই',
    jinish: 'জিনিস', jinis: 'জিনিস', kaj: 'কাজ', kaje: 'কাজে',
    manush: 'মানুষ', somoy: 'সময়', dorkar: 'দরকার', somossa: 'সমস্যা',
    bhalo: 'ভালো', valo: 'ভালো', kharap: 'খারাপ', sundor: 'সুন্দর',
    thik: 'ঠিক', thikache: 'ঠিক আছে', khub: 'খুব', onek: 'অনেক',
    ache: 'আছে', achi: 'আছি', achen: 'আছেন', chilo: 'ছিল', chilam: 'ছিলাম',
    hobe: 'হবে', hoy: 'হয়', hocche: 'হচ্ছে', hoyeche: 'হয়েছে',
    kori: 'করি', kora: 'করা', kore: 'করে', korbo: 'করব', korte: 'করতে',
    korchi: 'করছি', korben: 'করবেন', korlam: 'করলাম',
    bola: 'বলা', boli: 'বলি', bolo: 'বলো', bolte: 'বলতে', bolbo: 'বলব',
    banate: 'বানাতে', banabo: 'বানাবো', banano: 'বানানো',
    dekhte: 'দেখতে', dekhi: 'দেখি', dekha: 'দেখা',
    sunte: 'শুনতে', likhte: 'লিখতে', likhi: 'লিখি', porte: 'পড়তে',
    jante: 'জানতে', jani: 'জানি', jano: 'জানো',
    chai: 'চাই', chao: 'চাও', lagbe: 'লাগবে', lage: 'লাগে',
    debo: 'দেব', dibo: 'দিব', dao: 'দাও', diye: 'দিয়ে', niye: 'নিয়ে',
    theke: 'থেকে', jonno: 'জন্য', jonno2: 'জন্য', porjonto: 'পর্যন্ত',
    ar: 'আর', abar: 'আবার', ebong: 'এবং', kintu: 'কিন্তু', tai: 'তাই',
    jodi: 'যদি', tahole: 'তাহলে', karon: 'কারণ', jemon: 'যেমন',
    ekhon: 'এখন', ekhane: 'এখানে', okhane: 'ওখানে', kothay: 'কোথায়',
    kobe: 'কবে', keno: 'কেন', kemon: 'কেমন', kivabe: 'কীভাবে',
    aj: 'আজ', ajke: 'আজকে', kal: 'কাল', kalke: 'কালকে', por: 'পর',
    na: 'না', nai: 'নাই', hae: 'হ্যাঁ', hyan: 'হ্যাঁ',
    ki: 'কি', kee: 'কী', je: 'যে', to: 'তো', o: 'ও', ei: 'এই', oi: 'ওই',
    matro: 'মাত্র', aro: 'আরও', aar: 'আর', shudhu: 'শুধু',
    pare: 'পারে', pari: 'পারি', parbo: 'পারব', parben: 'পারবেন',
    thakbe: 'থাকবে', thaki: 'থাকি', jabe: 'যাবে', jabo: 'যাব',
    ashbe: 'আসবে', ashi: 'আসি', nam: 'নাম', bangla: 'বাংলা',
    ta: 'টা', ti: 'টি', tar2: 'টার', gula: 'গুলা', gulo: 'গুলো',
    manusher: 'মানুষের', manushe: 'মানুষে', jay: 'যায়', jabo2: 'যাব',
    acho: 'আছো', achis: 'আছিস', chhilo: 'ছিল', chhi: 'ছি',
    bes: 'বেশ', beshi: 'বেশি', kom: 'কম', aste: 'আস্তে', taratari: 'তাড়াতাড়ি',
    boro: 'বড়', choto: 'ছোট', notun: 'নতুন', purono: 'পুরনো',
    ghor: 'ঘর', bari: 'বাড়ি', rasta: 'রাস্তা', gari: 'গাড়ি',
    pani: 'পানি', khabar: 'খাবার', khete: 'খেতে', khai: 'খাই',
    taka: 'টাকা', boi: 'বই', lekha: 'লেখা', pora: 'পড়া',
    bondhu: 'বন্ধু', poribar: 'পরিবার', baba: 'বাবা', ma: 'মা',
    bhai: 'ভাই', bon: 'বোন', chele: 'ছেলে', meye: 'মেয়ে',
    desh: 'দেশ', sohor: 'শহর', gram: 'গ্রাম', dhaka: 'ঢাকা',
    projonto: 'পর্যন্ত', moddhe: 'মধ্যে', upor: 'উপর', niche: 'নিচে',
    age: 'আগে', pore: 'পরে', sathe: 'সাথে', chara: 'ছাড়া',
    jonne: 'জন্য', mane: 'মানে', mone: 'মনে', mon: 'মন',
    bujhi: 'বুঝি', bujhte: 'বুঝতে', shikhte: 'শিখতে', shikhi: 'শিখি',
    bebohar: 'ব্যবহার', bebosta: 'ব্যবস্থা', obosthay: 'অবস্থায়',
    sposto: 'স্পষ্ট', sotti: 'সত্যি', mittha: 'মিথ্যা',
    din: 'দিন', rat: 'রাত', sokal: 'সকাল', bikal: 'বিকাল',
    somoyer: 'সময়ের', bochor: 'বছর', mash: 'মাস', soptah: 'সপ্তাহ',

    // Latin cannot tell শ from স, or থ from ঠ, or দ from ড, so the rules
    // have to guess and these common words come out wrong. People type both
    // the s- and sh- spellings, so both are here.
    shomoy: 'সময়', somoy: 'সময়', shomoyer: 'সময়ের',
    shundor: 'সুন্দর', sundor: 'সুন্দর', shundori: 'সুন্দরী',
    shomossa: 'সমস্যা', somossa: 'সমস্যা', shomadhan: 'সমাধান',
    shob: 'সব', shobai: 'সবাই', sobai: 'সবাই', shobkichu: 'সবকিছু',
    shurur: 'শুরুর', shuru: 'শুরু', shesh: 'শেষ', shoman: 'সমান',
    thanda: 'ঠান্ডা', thandai: 'ঠান্ডাই', gorom: 'গরম',
    pathan: 'পাঠান', pathao: 'পাঠাও', pathate: 'পাঠাতে', pathai: 'পাঠাই',
    noshto: 'নষ্ট', nosto: 'নষ্ট', kothin: 'কঠিন', shohoj: 'সহজ',
    mishti: 'মিষ্টি', tok: 'টক', jhal: 'ঝাল',
    iccha: 'ইচ্ছা', icche: 'ইচ্ছে', chesta: 'চেষ্টা', chestha: 'চেষ্টা',
    dhonnobad: 'ধন্যবাদ', dukkhito: 'দুঃখিত', mongol: 'মঙ্গল',
    ghonta: 'ঘণ্টা', ghanta: 'ঘণ্টা', minute: 'মিনিট', second2: 'সেকেন্ড',
    guruttopurno: 'গুরুত্বপূর্ণ', dorkar: 'দরকার', proyojon: 'প্রয়োজন',
    shoitan: 'শয়তান', shahosh: 'সাহস', shanti: 'শান্তি',
    shona: 'শোনা', shonar: 'শোনার', shonte: 'শুনতে', shuni: 'শুনি',
    shunlam: 'শুনলাম', shono: 'শোনো', bola: 'বলা', bolar: 'বলার',
    kotodur: 'কতদূর', durer: 'দূরের', dur: 'দূর',

    // Dhaka colloquial endings that the phonetic rules get wrong.
    kortese: 'করতেছে', kortesi: 'করতেছি', kortechi: 'করতেছি',
    hoitese: 'হইতেছে', hoitechi: 'হইতেছি', hoiche: 'হইছে', hoyche: 'হয়েছে',
    jaitese: 'যাইতেছে', ashtese: 'আসতেছে', boltese: 'বলতেছে',
    dekhtese: 'দেখতেছে', khaitese: 'খাইতেছে', lagtese: 'লাগতেছে',
    kemne: 'কেমনে', kemon2: 'কেমন', jemne: 'যেমনে', okhono: 'এখনো',
    ekhono: 'এখনো', tokhon: 'তখন', jokhon: 'যখন', kokhon: 'কখন',
    nei: 'নেই', hoito: 'হয়তো', mone2: 'মনে', lagse: 'লাগছে',
    parse: 'পারছে', parsi: 'পারছি', dise: 'দিছে', nise: 'নিছে',
    gese: 'গেছে', gesi: 'গেছি', ashse: 'আসছে', bolse: 'বলছে',

    // Very common alternates the folding rules cannot reach.
    valo2: 'ভালো', bhala: 'ভালো', ase: 'আছে', achhe: 'আছে', asi: 'আছি',
    tumake: 'তোমাকে', apnara: 'আপনারা', amago: 'আমাদের',
    kothai: 'কোথায়', kichhu: 'কিছু', khubi: 'খুবই', sudhu: 'শুধু',
    jonnyo: 'জন্য', jonno3: 'জন্য', karone: 'কারণে', othoba: 'অথবা',
    nahole: 'নাহলে', noyto: 'নয়তো', bepar: 'ব্যাপার', bisoy: 'বিষয়',
    kotha: 'কথা', kothao: 'কোথাও', hoise: 'হইছে', hoisi: 'হইছি',
    banaise: 'বানাইছে', banaisi: 'বানাইছি', khaise: 'খাইছে',
    chele2: 'ছেলে', meye2: 'মেয়ে', loke: 'লোকে', lok: 'লোক',

    // Words the verb-ending rule above gets close but not right, because
    // the doubled consonant is a spelling habit rather than a real
    // inflection ("vallo" is just "valo"), or because the stem needs a
    // retroflex or palatal letter that phonetic rules cannot guess.
    // Duplicate keys later in this literal win, so these override.
    ai: 'এই', oh: 'ও', oita: 'ওইটা', aita: 'এইটা',
    vallo: 'ভালো', valloi: 'ভালোই', vallobasi: 'ভালোবাসি',
    hollo: 'হলো', kollo: 'করলো', kollam: 'করলাম', korbo: 'করবো',
    uthlo: 'উঠলো', uthlam: 'উঠলাম', uthbo: 'উঠবো', uthi: 'উঠি',
    sunlam: 'শুনলাম', sunchi: 'শুনছি', sunbo: 'শুনবো', sono: 'শোনো',
    sunte: 'শুনতে', sunte2: 'শুনতে', suni: 'শুনি',
    porlam: 'পড়লাম', porchi: 'পড়ছি', porbo: 'পড়বো', pori: 'পড়ি',
    dekhbo: 'দেখবো', jabo: 'যাবো', pabo: 'পাবো', dibo: 'দিবো',
    nibo: 'নিবো', khabo: 'খাবো', hobo: 'হবো', debo: 'দেবো',

    tin: 'তিন',

    // The letters Latin cannot tell apart: ট/ত, ড/দ, ড়/র, ী/ি, ূ/ু, ষ/শ/স,
    // the silent final vowel, and a first-syllable ো that the inherent
    // vowel rule writes as nothing.
    tomra: 'তোমরা', oder: 'ওদের', koto: 'কত', kon: 'কোন', konta: 'কোনটা',
    kono: 'কোনো', eta: 'এটা', ota: 'ওটা', oke: 'ওকে', mota: 'মোটা',
    nil: 'নীল', dal: 'ডাল', mach: 'মাছ', mangsho: 'মাংস', dim: 'ডিম',
    poisa: 'পয়সা', dokan: 'দোকান', nodi: 'নদী', pahar: 'পাহাড়',
    brishti: 'বৃষ্টি', rod: 'রোদ', batash: 'বাতাস', gach: 'গাছ',
    biral: 'বিড়াল', sondha: 'সন্ধ্যা', porshu: 'পরশু', proshno: 'প্রশ্ন',
    uttor: 'উত্তর', golpo: 'গল্প', chobi: 'ছবি', porikkha: 'পরীক্ষা',
    chakri: 'চাকরি', shorir: 'শরীর', chokh: 'চোখ', pet: 'পেট',
    bhalobasha: 'ভালোবাসা', bhalobashi: 'ভালোবাসি', valobashi: 'ভালোবাসি',
    bhalobasi: 'ভালোবাসি', valobasi: 'ভালোবাসি',
    dukkho: 'দুঃখ', sopno: 'স্বপ্ন', shopno: 'স্বপ্ন', jibon: 'জীবন',
    jete: 'যেতে', poro: 'পড়ো', chay: 'চায়', kandi: 'কাঁদি', chand: 'চাঁদ',
    pach: 'পাঁচ', choy: 'ছয়', samne: 'সামনে', pichone: 'পিছনে',
    kache: 'কাছে', ektu: 'একটু', hothat: 'হঠাৎ', bishoy: 'বিষয়',
    onko: 'অংক', bhasha: 'ভাষা', bhasa: 'ভাষা', porashona: 'পড়াশোনা',
    lekhapora: 'লেখাপড়া', chatro: 'ছাত্র', chatri: 'ছাত্রী',
    biswas: 'বিশ্বাস', bishwas: 'বিশ্বাস', oshukh: 'অসুখ', osudh: 'ওষুধ',
    oshudh: 'ওষুধ', daktar: 'ডাক্তার', bashay: 'বাসায়', ashol: 'আসল',
    sasta: 'সস্তা', chere: 'ছেড়ে', shothik: 'সঠিক', kapor: 'কাপড়',
    chosma: 'চশমা', ghori: 'ঘড়ি', dorja: 'দরজা', kisu: 'কিছু',
    borsha: 'বর্ষা', eid: 'ঈদ', puja: 'পূজা', uphar: 'উপহার',
    shubho: 'শুভ', shuvo: 'শুভ', khoma: 'ক্ষমা', dokkhin: 'দক্ষিণ',
    purbo: 'পূর্ব', poschim: 'পশ্চিম', jaiga: 'জায়গা', jayga: 'জায়গা',
    basa: 'বাসা', bari: 'বাড়ি', bangladesh: 'বাংলাদেশ', take: 'তাকে'
  };

  // Verb stems. Only the verb endings consult these: "ash" gives ashbo,
  // ashlam, ashche and asho with স rather than শ. They are kept out of
  // COMMON on purpose, because a bare stem as a word misleads the noun
  // classifiers: with kha in COMMON, "khata" (খাতা) split as খা + টা.
  const STEMS = {
    ash: 'আস', esh: 'এস', bosh: 'বস', path: 'পাঠ', ja: 'যা', kha: 'খা',
    bhalobash: 'ভালোবাস', valobash: 'ভালোবাস'
  };

  // Longest match wins, so three-character keys are tried first.
  const CONSONANTS = {
    kkh: 'ক্ষ', ngg: 'ঙ্গ', chh: 'ছ', jny: 'জ্ঞ', cch: 'চ্ছ',
    kh: 'খ', gh: 'ঘ', Ng: 'ঙ', ch: 'চ', jh: 'ঝ', NG: 'ঞ',
    Th: 'ঠ', Dh: 'ঢ', th: 'থ', dh: 'ধ', ph: 'ফ', bh: 'ভ',
    sh: 'শ', Sh: 'ষ', Rh: 'ঢ়', zh: 'ঝ', ngo: 'ং',
    k: 'ক', g: 'গ', c: 'চ', j: 'জ', T: 'ট', D: 'ড', N: 'ণ',
    t: 'ত', d: 'দ', n: 'ন', p: 'প', f: 'ফ', b: 'ব', v: 'ভ',
    m: 'ম', z: 'জ', r: 'র', l: 'ল', s: 'স', h: 'হ', R: 'ড়',
    y: 'য়', Y: 'য', w: 'ও', x: 'ক্স', q: 'ক'
  };

  // Standalone vowels, used at the start of a word.
  const VOWEL_FULL = {
    rri: 'ঋ', aa: 'আ', ii: 'ঈ', ee: 'ঈ', uu: 'ঊ', oo: 'ঊ',
    oi: 'ঐ', ou: 'ঔ', ow: 'ঔ', OI: 'ঐ',
    a: 'আ', i: 'ই', u: 'উ', e: 'এ', o: 'অ', O: 'ও', A: 'অ'
  };

  // Vowel signs, used after a consonant. 'o' is the inherent vowel, so it
  // adds nothing.
  const VOWEL_KAR = {
    rri: 'ৃ', aa: 'া', ii: 'ী', ee: 'ী',
    uu: 'ূ', oo: 'ূ', oi: 'ৈ', ou: 'ৌ',
    ow: 'ৌ', OI: 'ৈ',
    a: 'া', i: 'ি', u: 'ু', e: 'ে',
    o: '', O: 'ো', A: ''
  };

  function hasKey(table, key) {
    return Object.prototype.hasOwnProperty.call(table, key);
  }

  // Nobody spells Banglish the same way twice: "ami" and "aami",
  // "tomake" and "tomakey", "valo" and "vallo". Fold those together before
  // looking a word up. Only the dictionary uses this; if it misses, the
  // phonetic rules still run on the word exactly as it was typed.
  function normalise(word) {
    return word
      .toLowerCase()
      // Only repeated vowels fold: "aami" is just "ami". Repeated
      // consonants must survive, because they carry meaning in Bangla.
      // "bollo" (বললো, said) is not "bolo" (বলো, say).
      .replace(/([aeiou])\1+/g, '$1')
      .replace(/ey$/, 'e')           // tomakey -> tomake
      .replace(/y$/, 'i')            // kothay -> kothai
      .replace(/^(.*?)h(?=[kgcjtdpbs])/, '$1'); // bhalo keeps, mismatched h drops
  }

  function lookup(word) {
    const lower = word.toLowerCase();
    if (hasKey(COMMON, lower)) return COMMON[lower];
    // A known English word is not folded into a Bangla one: "money" would
    // otherwise lose its y and become mone (মনে).
    if (ENGLISH.has(lower)) return null;
    const folded = normalise(word);
    if (hasKey(COMMON, folded)) return COMMON[folded];
    return null;
  }

  // Bangla glues these onto the end of almost any noun ("kaj" + "ta" =
  // কাজটা). Phonetic rules give ত where the suffix needs ট, so peel the
  // suffix off, convert the stem, and re-attach the correct Bangla form.
  // The third field marks a noun classifier. Those attach to a thing
  // ("boita", "filegulo"), so a stem ending in a nasal is almost always a
  // word that merely happens to end this way: "chinta" is চিন্তা, not
  // চিন + টা, and "anguli" is আঙুলি, not আন + গুলি. Verb endings are
  // exempt, because a nasal stem there is ordinary (sunlam, janbo).
  const CLASSIFIER = 1;
  const KNOWN = 2;
  const SUFFIXES = [
    ['gulokey', 'গুলোকে', CLASSIFIER], ['gulake', 'গুলাকে', CLASSIFIER], ['gulor', 'গুলোর', CLASSIFIER],
    ['gulo', 'গুলো', CLASSIFIER], ['gula', 'গুলা', CLASSIFIER], ['guli', 'গুলি', CLASSIFIER],
    ['takey', 'টাকে', CLASSIFIER], ['take', 'টাকে', CLASSIFIER], ['tare', 'টারে', CLASSIFIER],
    ['tao', 'টাও', CLASSIFIER], ['tay', 'টায়', CLASSIFIER], ['tar', 'টার', CLASSIFIER],
    ['khana', 'খানা', CLASSIFIER], ['khani', 'খানি', CLASSIFIER],
    ['ta', 'টা', CLASSIFIER], ['ti', 'টি', CLASSIFIER],

    // Verb endings. Bangla keeps the inherent vowel between the stem and
    // these, so "dekh" + "lam" is দেখলাম and never দেখ্লাম. Without this
    // the engine welds a hasanta into almost every past and future tense.
    // The vowel-ending guard below keeps "bolo" (বলো) apart from
    // "bollo" (বললো): only a consonant stem reaches here.
    ['chilam', 'ছিলাম'], ['chilen', 'ছিলেন'], ['chilo', 'ছিলো'],
    ['chile', 'ছিলে'], ['chili', 'ছিলি'], ['chis', 'ছিস'],
    ['chen', 'ছেন'], ['chi', 'ছি'], ['che', 'ছে'], ['cho', 'ছো'],
    ['lam', 'লাম'], ['len', 'লেন'], ['li', 'লি'],
    ['lo', 'লো'], ['le', 'লে'], ['la', 'লা'],
    ['ben', 'বেন'], ['bo', 'বো'], ['be', 'বে'], ['bi', 'বি'],
    ['tam', 'তাম'], ['ten', 'তেন'],
    // Dhaka colloquial: korso, parso, dekhsi, hoise.
    ['so', 'ছো'], ['si', 'ছি'], ['se', 'ছে'],

    // The infinitive and the locative: korte, thakte, barite.
    ['te', 'তে'],

    // Endings that follow the stem's own vowel. Converting the word whole
    // gives the same letters for most stems, so these only run when the
    // dictionary knows the stem, which is when they fix something: "ash" is
    // আস, so ashbo, ashlam and asho stop coming out with শ.
    ['abo', 'াবো', KNOWN], ['abe', 'াবে', KNOWN], ['ate', 'াতে', KNOWN],
    ['ano', 'ানো', KNOWN], ['ao', 'াও', KNOWN], ['ai', 'াই', KNOWN],
    ['er', 'ের', KNOWN], ['ke', 'কে', KNOWN], ['na', 'না', KNOWN],
    ['e', 'ে', KNOWN], ['i', 'ি', KNOWN], ['o', 'ো', KNOWN], ['y', 'য়', KNOWN]
  ];

  // The perfect tense: bolechi, gechi, hoyechilo, kheyechi. The ch here is
  // always ছ, which no phonetic rule can know. Tried before SUFFIXES so
  // that "-echi" wins over the plain "-chi" above.
  const PERFECT = [
    ['iyechi', 'িয়েছি'], ['iyeche', 'িয়েছে'],
    ['echilam', 'েছিলাম'], ['echilen', 'েছিলেন'], ['echilo', 'েছিলো'],
    ['echile', 'েছিলে'], ['echen', 'েছেন'],
    ['echi', 'েছি'], ['eche', 'েছে'], ['echo', 'েছো']
  ];

  // After a stem that ends in a vowel, a vowel ending is written as the
  // full letter: ami + o is আমিও, valo + i is ভালোই.
  const FULL_AFTER_VOWEL = { 'ো': 'ও', 'ি': 'ই', 'ে': 'এ', 'া': 'আ', 'ু': 'উ' };
  const endsInVowel = bangla => /[\u0985-\u0994\u09BE-\u09CC]$/.test(bangla);

  // The continuous tense on a vowel stem: jacchi, khacchi. Checked before
  // SUFFIXES, whose plain "-chi" would otherwise take the last letters.
  const CONTINUOUS = [
    ['cchilam', 'চ্ছিলাম'], ['cchilo', 'চ্ছিলো'], ['cchen', 'চ্ছেন'],
    ['cchi', 'চ্ছি'], ['cche', 'চ্ছে'], ['ccho', 'চ্ছো']
  ];

  const stemOf = stem => STEMS[stem.toLowerCase()] || lookup(stem);
  const stemBangla = stem => stemOf(stem) || transliterateWord(stem);

  function attach(stem, ending) {
    const full = FULL_AFTER_VOWEL[ending[0]];
    return full && endsInVowel(stem) ? stem + full + ending.slice(1) : stem + ending;
  }

  function transliterateWord(word) {
    const hit = lookup(word);
    if (hit) return hit;

    // English first. A suffix match on an English word used to convert
    // only its tail: "possible" came out "possibলে", "little" as "littলে".
    // Words like "extensionta" and "filegulo" are safe here, because the
    // English shapes are anchored to the end and the Bangla suffix hides it.
    if (looksEnglish(word)) {
      // ...unless it is an English word wearing a Bangla classifier:
      // computerta, codeta, extensionta. The whole word looks English
      // because the stem does, so peel the classifier and keep the stem.
      // A short stem is not trusted ("quota" is not quo + টা).
      const lower = word.toLowerCase();
      for (const [tail, bangla, kind] of SUFFIXES) {
        if (kind !== CLASSIFIER || !lower.endsWith(tail)) continue;
        const stem = word.slice(0, word.length - tail.length);
        if (stem.length >= 4 && looksEnglish(stem)) return stem + bangla;
      }
      return word;
    }

    const lower = word.toLowerCase();
    for (const [tail, bangla] of PERFECT) {
      if (lower.length > tail.length && lower.endsWith(tail)) {
        const stem = word.slice(0, word.length - tail.length);
        if (/[^aeiouAEIOU]$/.test(stem)) return stemBangla(stem) + bangla;
      }
    }
    for (const [tail, bangla] of CONTINUOUS) {
      if (lower.length > tail.length && lower.endsWith(tail)) {
        const stem = word.slice(0, word.length - tail.length);
        if (stemOf(stem)) return stemBangla(stem) + bangla;
      }
    }
    for (const [tail, bangla, kind] of SUFFIXES) {
      if (lower.length > tail.length + 1 && lower.endsWith(tail)) {
        const stem = word.slice(0, word.length - tail.length);
        if (kind === KNOWN) {
          if (stemOf(stem)) return attach(stemBangla(stem), bangla);
          continue;
        }
        const known = lookup(stem) || looksEnglish(stem);
        if (kind === CLASSIFIER && !known && /[nm]$/i.test(stem)) continue;
        // A stem the dictionary knows, an English word, or anything ending
        // in a consonant. That keeps "data" and "rata" out of it.
        if (known || /[^aeiouAEIOU]$/.test(stem)) {
          return (kind === CLASSIFIER ? transliterateWord(stem) : stemBangla(stem)) + bangla;
        }
      }
    }

    let out = '';
    let i = 0;
    // True when the last thing emitted was a consonant that has not yet
    // received a vowel.
    let pendingConsonant = false;
    // য় never joins a conjunct: "hoyto" is হয়তো, not হয়্তো. It still waits
    // for a vowel sign (meye, kheye), so it is pending but cannot join.
    let canJoin = false;
    const n = word.length;

    while (i < n) {
      let matched = false;

      // Vowels first: no consonant key is also a vowel key.
      for (let len = 3; len >= 1 && !matched; len--) {
        if (len > n - i) continue;
        const chunk = word.substr(i, len);

        if (pendingConsonant && hasKey(VOWEL_KAR, chunk)) {
          // A trailing "o" is a real ও-kar, not the inherent vowel:
          // "bolo" is বলো, while the "o" inside "kok" is silent.
          const atWordEnd = i + len === n;
          out +=
            atWordEnd && (chunk === 'o' || chunk === 'A')
              ? 'ো'
              : VOWEL_KAR[chunk];
          pendingConsonant = false;
          i += len;
          matched = true;
        } else if (!pendingConsonant && hasKey(VOWEL_FULL, chunk)) {
          // An o that follows another vowel is spoken, so it is ও rather
          // than the silent অ that opens a word: nao, khao, amio.
          out += i > 0 && chunk === 'o' ? 'ও' : VOWEL_FULL[chunk];
          i += len;
          matched = true;
        }
      }
      if (matched) continue;

      // Nasal clusters. Bangla writes the velar nasal two different ways and
      // phonetic rules get every one of them wrong: "bangla" came out
      // বান্গ্লা instead of বাংলা, "ingreji" as ইন্গ্রেজি, "rong" as রন্গ.
      // Before a consonant or at the end of a word the cluster is the
      // anusvara ং and the g is not written at all (বাংলা, ইংরেজি, রং).
      // Before a vowel it is ঙ, which does carry the vowel (বাঙালি, ভাঙা).
      // An n before k is the same anusvara, but there the k stays (সংখ্যা,
      // অংক, সংকোচ).
      const pair = word.substr(i, 2).toLowerCase();
      if (pair === 'ng') {
        const after = word[i + 2];
        const beforeVowel = after && 'aeiouAEIOU'.includes(after);
        if (beforeVowel) {
          if (pendingConsonant && canJoin) out += HASANTA;
          out += 'ঙ';
          pendingConsonant = true;
          canJoin = true;
        } else {
          out += 'ং';
          pendingConsonant = false;
        }
        i += 2;
        continue;
      }
      if (pair === 'nk') {
        out += 'ং';
        pendingConsonant = false;
        i += 1;              // the k is a letter of its own
        continue;
      }

      for (let len = 3; len >= 1 && !matched; len--) {
        if (len > n - i) continue;
        const chunk = word.substr(i, len);

        if (hasKey(CONSONANTS, chunk)) {
          // A y straight after a consonant is the য-ফলা, not য়: sonkhya is
          // সংখ্যা, sondhya সন্ধ্যা, byabohar ব্যবহার.
          if (chunk === 'y' && pendingConsonant && canJoin) {
            out += HASANTA + 'য';
            i += len;
            matched = true;
            continue;
          }
          // Two consonants in a row form a conjunct.
          if (pendingConsonant && canJoin) out += HASANTA;
          // ড় and ঢ় cannot begin a Bangla word, so "Rashadul" is র, not ড়.
          if (i === 0 && (chunk === 'R' || chunk === 'Rh')) {
            out += 'র';
          } else {
            out += CONSONANTS[chunk];
          }
          pendingConsonant = true;
          canJoin = chunk !== 'y';
          i += len;
          matched = true;
        }
      }
      if (matched) continue;

      out += word[i];
      pendingConsonant = false;
      i++;
    }

    return out;
  }

  // Only Latin-letter runs are converted. Bangla text, digits, punctuation
  // and anything else is passed through untouched, so running the converter
  // twice on the same box is harmless.
  function banglishToBangla(text) {
    if (!text) return text;
    return text.replace(/[A-Za-z]+/g, match => transliterateWord(match));
  }

  // Pressing the Bangla button on text that is already Bangla, or on real
  // English, used to quietly mangle it. Work out what the text actually is
  // first so the caller can refuse instead.
  //   'banglish'  worth converting
  //   'bangla'    already in Bangla script
  //   'english'   real English, converting would wreck it
  //   'empty'     nothing to work with
  function classify(text) {
    if (!text || !text.trim()) return 'empty';

    const bengali = (text.match(/[\u0980-\u09FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;

    if (bengali === 0 && latin === 0) return 'empty';
    // Mixed is normal in Banglish ("amar computer e"), so Bangla only wins
    // when it clearly dominates.
    if (bengali > latin) return 'bangla';
    if (latin === 0) return 'bangla';

    const words = text.match(/[A-Za-z]+/g) || [];
    if (!words.length) return 'bangla';

    let english = 0;
    let bangla = 0;
    // A capitalised word in mid-sentence is a name (Rahim, Dhaka), which
    // says nothing about the language around it, so it is not counted.
    const counted = [...text.matchAll(/[A-Za-z]+/g)].filter(m => {
      const w = m[0];
      if (w === 'I' || !/^[A-Z][a-z]/.test(w)) return true;
      return /(^|[.!?।]\s*)$/.test(text.slice(0, m.index).trimEnd() ? text.slice(0, m.index) : '');
    }).map(m => m[0]);
    for (const word of counted) {
      const lower = word.toLowerCase();
      // The English list first: "to" is তো in Banglish, but in a sentence
      // that is otherwise English it is "to", and the other words decide.
      if (ENGLISH.has(lower)) english++;
      else if (hasKey(COMMON, lower) || hasKey(COMMON, normalise(word))) bangla++;
      else if (looksEnglish(word)) english++;
    }
    // Clear English wins when most words are English. One Bangla-looking
    // word, or a fifth of them, no longer outvotes the rest: translator
    // output like "I speak Bangla every day" or "He is a good boy" (boy folds
    // to boi, বই) was called Banglish, and অ transliterated it into a jumble.
    // Mixing a few English words into Banglish is still normal, and those
    // sentences keep Bangla words in the majority.
    const tolerated = Math.max(1, Math.floor(counted.length * 0.2));
    if (english >= 3 && bangla <= tolerated && english / Math.max(1, counted.length) >= 0.6) {
      return 'english';
    }

    return 'banglish';
  }

  // How many words the dictionary knows as Bangla, and how many look
  // English. Used to decide whether someone typing in a search box is
  // writing Bangla: classify() is tuned for the buttons and calls unknown
  // words Banglish, which is too loose for popping up uninvited.
  function stats(text) {
    const words = (text || '').match(/[A-Za-z]+/g) || [];
    let bangla = 0, english = 0;
    for (const w of words) {
      if (lookup(w)) bangla++;
      else if (looksEnglish(w)) english++;
    }
    return { words: words.length, bangla, english };
  }

  return { convert: banglishToBangla, classify, stats };
  }

  let engine = null;
  const ready = () => engine || (engine = build());
  self.UktiBanglish = {
    convert: text => ready().convert(text),
    classify: text => ready().classify(text),
    stats: text => ready().stats(text)
  };
})();
