(function attachCases(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MurderCaseCases = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCasesModule() {
  'use strict';

  const HOTSPOT_TYPES = Object.freeze({
    CRITICAL: 'critical',
    USEFUL: 'useful',
    RED_HERRING: 'red_herring',
    FLAVOR: 'flavor'
  });

  const evidence = [
    {
      id: 'broken-wine-glass',
      title: 'แก้วไวน์แตก',
      shortDescription: 'แก้วคริสตัลแตกอยู่ข้างโต๊ะทำงาน มีไวน์แดงเหลือเพียงเล็กน้อย',
      icon: 'wine-glass',
      hotspots: [
        {
          id: 'glass-rim-residue',
          label: 'คราบที่ขอบแก้ว',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'ผลึกยาพิษที่ขอบแก้ว',
          result: 'ใต้แสงเฉียงพบผลึกสีน้ำตาลจางเกาะเฉพาะด้านในขอบแก้ว ไม่กระจายอยู่ทั่วคราบไวน์ แสดงว่าสารถูกแต้มลงในแก้วเป้าหมาย ไม่ได้ผสมในขวด',
          notebook: 'พิษถูกใส่เฉพาะแก้วของวิชาญ ไม่ได้อยู่ในไวน์ทั้งขวด',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['method', 'targeted-poisoning']
        },
        {
          id: 'glass-break-pattern',
          label: 'แนวรอยแตก',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'แก้วแตกหลังผู้ตายล้ม',
          result: 'รอยกระจายของเศษแก้วเริ่มจากจุดกระแทกที่พื้น ไม่พบแรงบีบหรือรอยอาวุธ แก้วน่าจะหลุดจากมือเมื่อวิชาญทรุดตัว',
          notebook: 'แก้วแตกเป็นผลจากการล้ม ไม่ใช่อาวุธสังหาร',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['method', 'timeline']
        },
        {
          id: 'glass-old-fingerprint',
          label: 'รอยนิ้วมือบนก้านแก้ว',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'รอยนิ้วมือของภาคิน',
          result: 'มีรอยนิ้วมือบางส่วนของภาคิน แต่ป้านวลยืนยันว่าแก้วใบนี้ถูกใช้ในงานเลี้ยงครอบครัวเมื่อสัปดาห์ก่อน และเครื่องล้างแก้วเสีย รอยดังกล่าวจึงระบุเวลาไม่ได้',
          notebook: 'รอยนิ้วมือเก่าของภาคินบนก้านแก้วระบุเวลาไม่ได้',
          relatedSuspects: ['ภาคิน'],
          relatedLocations: [],
          clueTags: ['fingerprint', 'unreliable']
        },
        {
          id: 'glass-engraving',
          label: 'ตราสลักใต้ฐาน',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'แก้วประจำตระกูล',
          result: 'ตัวอักษร “ธ” ใต้ฐานเป็นตราของชุดแก้วที่วิชาญสั่งทำเมื่อครบรอบบริษัท ไม่มีข้อมูลเชื่อมโยงกับการตาย',
          notebook: 'แก้วเป็นของชุดประจำตระกูลธนากุล',
          relatedSuspects: [],
          relatedLocations: [],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'will-folder',
      title: 'แฟ้มพินัยกรรม',
      shortDescription: 'แฟ้มหนังบนโต๊ะมีร่างพินัยกรรมฉบับใหม่และเอกสารการเงินซ่อนอยู่',
      icon: 'folder',
      hotspots: [
        {
          id: 'will-hidden-debt',
          label: 'ซองเอกสารในปกหลัง',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'หนี้ลับของอารักษ์',
          result: 'ในซองมีสัญญากู้ที่อารักษ์ค้างชำระวิชาญจำนวนมาก พร้อมบันทึกว่าพินัยกรรมฉบับใหม่จะตัดสิทธิประโยชน์ของอารักษ์และเรียกหนี้คืนทันที',
          notebook: 'อารักษ์มีหนี้ลับ และจะเสียผลประโยชน์เมื่อพินัยกรรมใหม่มีผล',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน', 'ห้องเก็บเอกสาร'],
          clueTags: ['motive', 'debt', 'new-will']
        },
        {
          id: 'will-signature-time',
          label: 'หน้าลงนาม',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'ยังขาดลายเซ็นพยาน',
          result: 'วิชาญลงชื่อไว้เวลา 21:35 น. แต่ช่องพยานยังว่าง พินัยกรรมจะสมบูรณ์ในเช้าวันถัดไป ทำให้คนที่กำลังเสียประโยชน์มีเวลาเหลือเพียงคืนนี้',
          notebook: 'พินัยกรรมใหม่กำลังจะสมบูรณ์ในเช้าวันรุ่งขึ้น',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['motive', 'timeline']
        },
        {
          id: 'will-torn-corner',
          label: 'มุมกระดาษที่ฉีก',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'เศษกระดาษติดกระดุมมินตรา',
          result: 'เส้นใยตรงมุมคล้ายเศษที่ติดเสื้อมินตรา แต่เธอเป็นผู้จัดแฟ้มก่อนเริ่มอ่านพินัยกรรม จึงเป็นการสัมผัสตามหน้าที่และไม่บอกว่าเธอแก้เอกสาร',
          notebook: 'เศษแฟ้มบนเสื้อมินตราเกิดจากการจัดเอกสาร',
          relatedSuspects: ['มินตรา'],
          relatedLocations: [],
          clueTags: ['paper', 'innocent-contact']
        },
        {
          id: 'will-watermark',
          label: 'ลายน้ำบนกระดาษ',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'กระดาษสำนักงานกฎหมาย',
          result: 'ลายน้ำเป็นของสำนักงานกฎหมายที่ครอบครัวใช้มานาน ตรงกับกระดาษฉบับร่างอื่นทุกประการ',
          notebook: 'ร่างพินัยกรรมใช้กระดาษปกติของสำนักงานกฎหมาย',
          relatedSuspects: [],
          relatedLocations: [],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'security-camera',
      title: 'กล้องวงจรปิด',
      shortDescription: 'เครื่องบันทึกภาพครอบคลุมโถงทางเดิน หน้าครัว และประตูห้องทำงาน',
      icon: 'camera',
      hotspots: [
        {
          id: 'camera-arak-study',
          label: 'ช่วงเวลา 21:47 น.',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'อารักษ์นำถาดเข้าไป',
          result: 'ภาพแสดงอารักษ์รับถาดไวน์จากโต๊ะพักแล้วเข้าห้องทำงานเพียงลำพัง เขาออกมาในอีกหกนาทีต่อมาโดยไม่มีถาด ทั้งที่ให้การว่าไม่เคยแตะไวน์',
          notebook: 'อารักษ์ถือถาดไวน์เข้าห้องทำงานและโกหกเรื่องการสัมผัสไวน์',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['opportunity', 'lie', 'location']
        },
        {
          id: 'camera-system-log',
          label: 'บันทึกระบบ 21:40–22:10 น.',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'กล้องดับจากแผงควบคุมภายใน',
          result: 'มีภาพขาดไป 84 วินาทีหลังอารักษ์ออกจากห้อง ระบบบันทึกว่าถูกสั่งพักจากแผงในห้องทำงาน ไม่ใช่ไฟดับทั้งบ้าน',
          notebook: 'มีผู้สั่งพักกล้องจากในห้องทำงาน ไม่ใช่เหตุไฟฟ้าขัดข้อง',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['tampering', 'location']
        },
        {
          id: 'camera-garden-shadow',
          label: 'เงาร่างที่ประตูสวน',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'ศศินอยู่ใกล้สวน',
          result: 'เงาร่างคล้ายศศินผ่านประตูสวนเวลา 21:52 น. แต่กล้องอีกมุมยืนยันว่าเขาคุยโทรศัพท์อยู่ด้านนอกต่อเนื่องจน 22:16 น. และไม่ได้เข้าห้องทำงาน',
          notebook: 'ศศินอยู่สวนจริง แต่ภาพอีกมุมยืนยันว่าไม่ได้เข้าห้องทำงาน',
          relatedSuspects: ['ศศิน'],
          relatedLocations: ['สวนหลังบ้าน'],
          clueTags: ['alibi', 'misleading-angle']
        },
        {
          id: 'camera-clock-sync',
          label: 'สถานะเวลาของเครื่อง',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'เวลาของกล้องเที่ยงตรง',
          result: 'เครื่องซิงก์เวลากับเราเตอร์ก่อนเกิดเหตุสองชั่วโมง ความคลาดเคลื่อนไม่เกินสามวินาที',
          notebook: 'เวลาบนกล้องวงจรปิดเชื่อถือได้',
          relatedSuspects: [],
          relatedLocations: [],
          clueTags: ['timeline']
        }
      ]
    },
    {
      id: 'wine-tray',
      title: 'ถาดไวน์',
      shortDescription: 'ถาดเงินถูกทิ้งไว้บนตู้เตี้ยในห้องทำงาน มีรอยแก้วสองวง',
      icon: 'tray',
      hotspots: [
        {
          id: 'tray-wax-mark',
          label: 'จุดขี้ผึ้งใต้หลุมวางแก้ว',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'แก้วเป้าหมายถูกทำเครื่องหมาย',
          result: 'จุดขี้ผึ้งสีน้ำเงินถูกแต้มใต้ตำแหน่งแก้วของวิชาญ เศษขี้ผึ้งสีและสูตรเดียวกันติดอยู่ในช่องแหวนตราของอารักษ์ ทำให้เขาจำแก้วที่ใส่พิษได้',
          notebook: 'อารักษ์ใช้ขี้ผึ้งจากแหวนตราทำเครื่องหมายตำแหน่งแก้วของวิชาญ',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['killer', 'premeditation', 'method']
        },
        {
          id: 'tray-bottle-seal',
          label: 'ขวดและจุกไวน์',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'ไวน์ในขวดสะอาด',
          result: 'ซีลขวดและไวน์ที่เหลือไม่พบสารพิษ ยืนยันว่าคนร้ายไม่ได้วางยาแขกทุกคน แต่จัดการกับแก้วของวิชาญหลังรินแล้ว',
          notebook: 'ขวดไวน์ไม่มีพิษ—คนร้ายวางยาในแก้วหลังริน',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['method', 'targeted-poisoning']
        },
        {
          id: 'tray-mintra-print',
          label: 'รอยนิ้วมือบนขอบถาด',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'รอยนิ้วมือของมินตรา',
          result: 'รอยของมินตราชัดเจน แต่ภาพจากครัวยืนยันว่าเธอเป็นคนจัดถาดตามคำสั่งป้านวล ก่อนอารักษ์จะรับถาดไป การพบรอยจึงสอดคล้องกับงานของเธอ',
          notebook: 'มินตราจัดถาดตามหน้าที่ก่อนอารักษ์นำไป',
          relatedSuspects: ['มินตรา', 'อารักษ์'],
          relatedLocations: ['ห้องครัว'],
          clueTags: ['innocent-contact']
        },
        {
          id: 'tray-silver-pattern',
          label: 'ลายสลักบนถาด',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'ของขวัญวันแต่งงาน',
          result: 'ข้อความใต้ถาดระบุว่าเป็นของขวัญวันแต่งงานของวิชาญเมื่อสามสิบปีก่อน ไม่มีช่องลับหรือรอยดัดแปลง',
          notebook: 'ถาดเป็นของเก่าประจำบ้านและไม่มีช่องซ่อน',
          relatedSuspects: [],
          relatedLocations: [],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'nuan-testimony',
      title: 'คำให้การของป้านวล',
      shortDescription: 'แม่บ้านเก่าแก่เห็นการเตรียมไวน์และได้ยินบทสนทนาก่อนเกิดเหตุ',
      icon: 'statement',
      hotspots: [
        {
          id: 'nuan-overheard-threat',
          label: 'คำโต้เถียงหลังประตู',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: '“พรุ่งนี้ผมจะหมดทุกอย่าง”',
          result: 'ป้านวลจำเสียงอารักษ์ได้ เขาพูดกับวิชาญว่า “ถ้าพินัยกรรมใหม่นี้ลงนาม พรุ่งนี้ผมจะหมดทุกอย่าง” ก่อนจะเดินออกมาพร้อมกำแหวนตราของตนแน่น',
          notebook: 'อารักษ์ยอมรับโดยอ้อมว่าพินัยกรรมใหม่ทำให้เขาสูญเสียทุกอย่าง',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['motive', 'timeline']
        },
        {
          id: 'nuan-private-meeting',
          label: 'ลำดับแขกที่เข้าพบ',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'อารักษ์พบผู้ตายเป็นคนสุดท้าย',
          result: 'วิชาญขอคุยเรื่องเอกสารกับอารักษ์ตามลำพังหลัง 21:45 น. คนอื่นถูกขอให้อยู่ในห้องรับแขก ยกเว้นศศินที่ออกไปรับโทรศัพท์ในสวน',
          notebook: 'อารักษ์เป็นคนสุดท้ายที่พบวิชาญตามลำพังก่อนผู้ตายดื่มไวน์',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน', 'ห้องรับแขก'],
          clueTags: ['opportunity', 'timeline']
        },
        {
          id: 'nuan-wrong-chime',
          label: 'เสียงนาฬิกาที่ป้านวลจำได้',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'เวลาในคำให้การคลาดเคลื่อน',
          result: 'ป้านวลคิดว่าได้ยินเสียงทะเลาะตอนสี่ทุ่ม ซึ่งอาจพาดพิงภาคิน แต่ช่างนาฬิกายืนยันว่านาฬิกาโถงตีช้าสิบห้านาที เวลาจริงคือ 21:45 น.',
          notebook: 'เวลาที่ป้านวลจำจากเสียงนาฬิกาช้าไป 15 นาที',
          relatedSuspects: ['ภาคิน'],
          relatedLocations: ['ห้องรับแขก'],
          clueTags: ['timeline', 'unreliable']
        },
        {
          id: 'nuan-dessert',
          label: 'รายการของหวาน',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'ของหวานยังไม่ได้เสิร์ฟ',
          result: 'บัวลอยที่ป้านวลเตรียมไว้ยังอยู่ครบในครัว ไม่มีส่วนผสมต้องสงสัย และไม่มีใครกินก่อนเกิดเหตุ',
          notebook: 'ของหวานไม่เกี่ยวข้องกับการเสียชีวิต',
          relatedSuspects: ['ป้านวล'],
          relatedLocations: ['ห้องครัว'],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'study-room',
      title: 'ห้องทำงาน',
      shortDescription: 'สถานที่พบศพ ประตูเปิดแง้ม โต๊ะทำงานยังเปิดโคมไฟไว้',
      icon: 'room',
      hotspots: [
        {
          id: 'study-desk-drawer',
          label: 'ลิ้นชักโต๊ะที่ล็อกไม่สนิท',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'รอยซองหนี้ถูกค้น',
          result: 'ฝุ่นในลิ้นชักเป็นกรอบว่างขนาดเดียวกับซองสัญญากู้ในแฟ้มพินัยกรรม และมีรอยถุงมือสด ๆ อารักษ์รู้ตำแหน่งลิ้นชักจากการดูแลบัญชีให้วิชาญ',
          notebook: 'มีคนค้นเอกสารหนี้ในโต๊ะ และอารักษ์รู้ที่เก็บเอกสารนั้น',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['motive', 'knowledge']
        },
        {
          id: 'study-door-window',
          label: 'ประตูและหน้าต่าง',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'ไม่มีทางเข้าจากสวน',
          result: 'หน้าต่างถูกกลอนจากด้านในและฝุ่นบนขอบไม่ถูกรบกวน คนที่เข้าออกต้องผ่านประตูโถงซึ่งอยู่ในภาพกล้อง',
          notebook: 'คนร้ายเข้าออกห้องทำงานทางประตูโถง ไม่ได้มาจากสวน',
          relatedSuspects: ['ศศิน'],
          relatedLocations: ['ห้องทำงาน', 'สวนหลังบ้าน'],
          clueTags: ['location', 'access']
        },
        {
          id: 'study-muddy-print',
          label: 'รอยรองเท้าเปื้อนดิน',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'รอยรองเท้าของศศิน',
          result: 'รอยดินตรงพรมเป็นรองเท้าศศินจริง แต่ดินแห้งและถูกเส้นใยพรมทับ แสดงว่าเกิดตั้งแต่เขาเข้าพบวิชาญตอนบ่าย ไม่ใช่ในช่วงฆาตกรรม',
          notebook: 'รอยรองเท้าศศินเกิดก่อนคืนเกิดเหตุหลายชั่วโมง',
          relatedSuspects: ['ศศิน'],
          relatedLocations: ['สวนหลังบ้าน'],
          clueTags: ['old-trace', 'unreliable']
        },
        {
          id: 'study-record-player',
          label: 'เครื่องเล่นแผ่นเสียง',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'เพลงโปรดหยุดกลางแผ่น',
          result: 'เข็มค้างอยู่บนเพลงโปรดของวิชาญ ฝุ่นรอบเครื่องสม่ำเสมอ ไม่มีร่องรอยว่าถูกใช้ซ่อนสิ่งของ',
          notebook: 'เครื่องเล่นเพลงไม่มีร่องรอยเกี่ยวกับคดี',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'kitchen',
      title: 'ห้องครัว',
      shortDescription: 'จุดเตรียมถาดไวน์ มีอ่างล้างจาน ตู้เครื่องเทศ และสมุดเวรคนรับใช้',
      icon: 'kitchen',
      hotspots: [
        {
          id: 'kitchen-drain-residue',
          label: 'ตะแกรงอ่างล้างจาน',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'สารชนิดเดียวกับพิษในแก้ว',
          result: 'พบผงอัลคาลอยด์ชนิดเดียวกับในแก้วติดตะแกรง พร้อมเส้นใยจากผ้าเช็ดหน้าสีน้ำเงิน ป้านวลเห็นอารักษ์ล้างมือและผ้าเช็ดหน้าตรงนี้หลังออกจากห้องทำงาน',
          notebook: 'อารักษ์ล้างคราบพิษจากผ้าเช็ดหน้าสีน้ำเงินในอ่างครัว',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องครัว', 'ห้องทำงาน'],
          clueTags: ['killer', 'method', 'cleanup']
        },
        {
          id: 'kitchen-duty-log',
          label: 'สมุดเวรและเวลาจัดถาด',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'มินตราส่งต่อถาดโดยไม่ได้เข้าห้องทำงาน',
          result: 'บันทึกและภาพหน้าครัวตรงกัน: มินตราจัดถาดเวลา 21:42 น. ป้านวลตรวจขวด แล้วอารักษ์อาสานำถาดไปให้วิชาญเวลา 21:47 น.',
          notebook: 'ลำดับการส่งถาดทำให้อารักษ์มีโอกาสจัดการแก้วหลังคนอื่นตรวจแล้ว',
          relatedSuspects: ['มินตรา', 'ป้านวล', 'อารักษ์'],
          relatedLocations: ['ห้องครัว', 'ห้องทำงาน'],
          clueTags: ['opportunity', 'timeline']
        },
        {
          id: 'kitchen-bitter-herb',
          label: 'ขวดสมุนไพรรสขม',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'สมุนไพรของป้านวลไม่ใช่พิษ',
          result: 'ขวดติดชื่อป้านวลและมีกลิ่นขม แต่ผลตรวจเป็นยาหอมพื้นบ้านที่ไม่เป็นพิษ แม้ใช้ปริมาณสูงก็ไม่ตรงกับสารในเลือดผู้ตาย',
          notebook: 'สมุนไพรของป้านวลไม่ใช่สารที่ฆ่าวิชาญ',
          relatedSuspects: ['ป้านวล'],
          relatedLocations: ['ห้องครัว'],
          clueTags: ['harmless', 'misleading']
        },
        {
          id: 'kitchen-menu-board',
          label: 'กระดานรายการอาหาร',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'มื้อเย็นธรรมดา',
          result: 'เมนูทั้งหมดตรงกับวัตถุดิบและไม่มีแขกคนใดมีอาการผิดปกติ จึงไม่น่าเป็นการปนเปื้อนจากอาหารร่วมกัน',
          notebook: 'อาหารมื้อเย็นไม่มีความผิดปกติ',
          relatedSuspects: [],
          relatedLocations: ['ห้องครัว'],
          clueTags: ['background']
        }
      ]
    },
    {
      id: 'forensic-report',
      title: 'รายงานนิติเวช',
      shortDescription: 'รายงานชันสูตรเบื้องต้นระบุเวลาและสาเหตุการเสียชีวิต',
      icon: 'forensics',
      hotspots: [
        {
          id: 'forensic-toxicology',
          label: 'ผลพิษวิทยา',
          category: HOTSPOT_TYPES.CRITICAL,
          resultTitle: 'เสียชีวิตจากไวน์ผสมยาพิษ',
          result: 'เลือดและไวน์ในกระเพาะมีอัลคาลอยด์ออกฤทธิ์ต่อหัวใจเข้มข้นถึงตาย สารละลายได้ดีในแอลกอฮอล์ และไม่พบในอาหารหรือขวดไวน์ที่เหลือ',
          notebook: 'วิชาญเสียชีวิตจากยาพิษที่ถูกใส่ลงในแก้วไวน์ของเขา',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['method', 'cause-of-death']
        },
        {
          id: 'forensic-death-window',
          label: 'ช่วงเวลาเสียชีวิต',
          category: HOTSPOT_TYPES.USEFUL,
          resultTitle: 'พิษออกฤทธิ์หลังดื่ม 15–25 นาที',
          result: 'อุณหภูมิร่างกายและการดูดซึมระบุว่าเขาดื่มสารพิษราว 21:50–21:58 น. และเสียชีวิตประมาณ 22:15 น. ตรงกับช่วงหลังอารักษ์นำถาดเข้าไป',
          notebook: 'เวลารับพิษตรงกับช่วงที่อารักษ์อยู่ในห้องทำงานพร้อมถาดไวน์',
          relatedSuspects: ['อารักษ์'],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['timeline', 'opportunity']
        },
        {
          id: 'forensic-head-bruise',
          label: 'รอยฟกช้ำที่ขมับ',
          category: HOTSPOT_TYPES.RED_HERRING,
          resultTitle: 'บาดแผลเกิดจากการล้ม',
          result: 'รอยฟกช้ำดูเหมือนถูกตี แต่ไม่มีเลือดออกในสมองและมุมกระแทกตรงกับขอบโต๊ะ เกิดหลังพิษเริ่มทำให้หมดแรง ไม่ใช่สาเหตุการตาย',
          notebook: 'รอยที่ศีรษะเกิดจากการล้ม ไม่ใช่อาวุธทุบ',
          relatedSuspects: [],
          relatedLocations: ['ห้องทำงาน'],
          clueTags: ['method', 'misleading-injury']
        },
        {
          id: 'forensic-jacket-fiber',
          label: 'เส้นใยบนเสื้อผู้ตาย',
          category: HOTSPOT_TYPES.FLAVOR,
          resultTitle: 'เส้นใยจากผ้าห่มฉุกเฉิน',
          result: 'เส้นใยสีเทามาจากผ้าห่มที่ภาคินใช้คลุมร่างหลังพบศพ ไม่ได้ติดอยู่ก่อนเสียชีวิต',
          notebook: 'เส้นใยสีเทามาจากความพยายามช่วยเหลือหลังพบศพ',
          relatedSuspects: ['ภาคิน'],
          relatedLocations: [],
          clueTags: ['background']
        }
      ]
    }
  ];

  const firstCase = {
    id: 'the-night-of-the-will',
    version: 1,
    title: 'คดีคืนเปิดพินัยกรรม',
    victim: 'วิชาญ ธนากุล',
    subtitle: 'คำประกาศมรดกที่ไม่มีวันมาถึงรุ่งเช้า',
    briefing: 'คืนก่อนลงนามพินัยกรรมฉบับใหม่ วิชาญ ธนากุล ถูกพบเสียชีวิตข้างโต๊ะทำงาน ทุกคนในบ้านมีเหตุให้ไม่พอใจเขา แต่คุณมีเวลาตรวจหลักฐานเพียงจำกัด จงเลือกจุดตรวจให้คุ้มค่าและประกอบคำกล่าวหาให้ครบทั้งคนร้าย วิธี สถานที่ และแรงจูงใจ',
    objective: 'ระบุตัวฆาตกร วิธีสังหาร สถานที่ และแรงจูงใจ ก่อนจำนวนการตรวจจะหมด',
    maxActions: 12,
    initialActions: 12,
    actionLimit: 12,
    suspects: ['ภาคิน', 'มินตรา', 'อารักษ์', 'ป้านวล', 'ศศิน'],
    suspectProfiles: [
      { id: 'phakin', name: 'ภาคิน', role: 'บุตรชายคนโต', summary: 'มีปากเสียงเรื่องส่วนแบ่งมรดก แต่เป็นคนพบศพและเรียกทุกคนมาช่วย' },
      { id: 'mintra', name: 'มินตรา', role: 'หลานสาวและผู้ช่วยส่วนตัว', summary: 'เป็นผู้จัดแฟ้มกับถาดไวน์ จึงทิ้งร่องรอยไว้หลายแห่งตามหน้าที่' },
      { id: 'arak', name: 'อารักษ์', role: 'ที่ปรึกษาการเงินของครอบครัว', summary: 'ดูแลบัญชีและเอกสารหนี้ของวิชาญ รู้ทางเข้าออกและกิจวัตรในบ้านดี' },
      { id: 'nuan', name: 'ป้านวล', role: 'แม่บ้านเก่าแก่', summary: 'เตรียมอาหารและตรวจขวดไวน์ แต่ความจำเรื่องเวลาคลาดเคลื่อนเพราะนาฬิกาโถง' },
      { id: 'sasin', name: 'ศศิน', role: 'หุ้นส่วนธุรกิจ', summary: 'ทะเลาะเรื่องสัญญาในช่วงบ่าย และอยู่ที่สวนหลังบ้านระหว่างช่วงสำคัญ' }
    ],
    locations: ['ห้องทำงาน', 'ห้องรับแขก', 'ห้องครัว', 'สวนหลังบ้าน', 'ห้องเก็บเอกสาร'],
    locationDetails: [
      { id: 'study', name: 'ห้องทำงาน', summary: 'จุดพบศพและจุดที่วิชาญดื่มไวน์แก้วสุดท้าย' },
      { id: 'living-room', name: 'ห้องรับแขก', summary: 'ที่รวมตัวของครอบครัวก่อนอ่านพินัยกรรม' },
      { id: 'kitchen', name: 'ห้องครัว', summary: 'จุดจัดถาดไวน์และพบร่องรอยการล้างสารพิษ' },
      { id: 'garden', name: 'สวนหลังบ้าน', summary: 'จุดที่ศศินโทรศัพท์อยู่ในช่วงเกิดเหตุ' },
      { id: 'archive', name: 'ห้องเก็บเอกสาร', summary: 'ที่เก็บสำเนาพินัยกรรมและบัญชีเก่า' }
    ],
    methods: [
      { value: 'poisoned wine', label: 'ไวน์ผสมยาพิษ' },
      { value: 'blunt force trauma', label: 'ทุบด้วยของแข็ง' },
      { value: 'staged fall', label: 'จัดฉากให้ตกจากที่สูง' },
      { value: 'strangulation', label: 'รัดคอ' }
    ],
    motives: [
      { value: 'hidden debt and loss of benefit from the new will', label: 'หนี้ลับและการเสียผลประโยชน์จากพินัยกรรมฉบับใหม่' },
      { value: 'inheritance dispute', label: 'ความขัดแย้งเรื่องส่วนแบ่งมรดก' },
      { value: 'revenge over betrayal', label: 'แก้แค้นจากการถูกหักหลัง' },
      { value: 'concealment of theft', label: 'ปกปิดการขโมยทรัพย์สิน' }
    ],
    evidence,
    evidenceDeck: evidence,
    timeline: [
      { time: '21:35', event: 'วิชาญลงชื่อในร่างพินัยกรรม แต่ยังรอพยาน' },
      { time: '21:42', event: 'มินตราจัดถาดไวน์ในครัว' },
      { time: '21:47', event: 'อารักษ์นำถาดเข้าไปในห้องทำงาน' },
      { time: '21:53', event: 'อารักษ์ออกจากห้องทำงาน' },
      { time: 'ประมาณ 21:55', event: 'วิชาญดื่มไวน์ที่ถูกวางยา' },
      { time: 'ประมาณ 22:15', event: 'วิชาญเสียชีวิต' }
    ],
    solution: {
      killer: 'อารักษ์',
      method: 'poisoned wine',
      location: 'ห้องทำงาน',
      motive: 'hidden debt and loss of benefit from the new will'
    },
    solutionLabels: {
      killer: 'อารักษ์',
      method: 'ไวน์ผสมยาพิษ',
      location: 'ห้องทำงาน',
      motive: 'หนี้ลับและการเสียผลประโยชน์จากพินัยกรรมฉบับใหม่'
    },
    solutionExplanation: 'อารักษ์ซ่อนหนี้ที่ติดค้างวิชาญไว้ และพินัยกรรมฉบับใหม่กำลังตัดผลประโยชน์พร้อมเรียกหนี้คืน เขาจึงอาสานำถาดเข้าไป แต้มขี้ผึ้งเพื่อจำแก้วของวิชาญ ใส่พิษลงในไวน์เฉพาะแก้ว แล้วล้างคราบที่ครัว ภาพกล้อง เวลาออกฤทธิ์ และร่องรอยขี้ผึ้งเชื่อมการกระทำทั้งหมดเข้าด้วยกัน',
    scoring: {
      answerPoints: { killer: 40, method: 20, location: 20, motive: 20 },
      actionBonusMax: 10,
      criticalClueBonus: { perClue: 1, max: 5 },
      redHerringPenalty: { perClue: 1, max: 5 }
    }
  };

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }

    Object.freeze(value);
    Object.keys(value).forEach(function freezeChild(key) {
      deepFreeze(value[key]);
    });
    return value;
  }

  const CASES = deepFreeze([firstCase]);

  function getCaseById(caseId) {
    return CASES.find(function findCase(caseData) {
      return caseData.id === caseId;
    }) || null;
  }

  function getEvidenceById(caseOrId, evidenceId) {
    const caseData = typeof caseOrId === 'string' ? getCaseById(caseOrId) : caseOrId;
    if (!caseData) return null;
    return caseData.evidence.find(function findEvidence(item) {
      return item.id === evidenceId;
    }) || null;
  }

  function getHotspotById(caseOrId, evidenceId, hotspotId) {
    const evidenceCard = getEvidenceById(caseOrId, evidenceId);
    if (!evidenceCard) return null;
    return evidenceCard.hotspots.find(function findHotspot(hotspot) {
      return hotspot.id === hotspotId;
    }) || null;
  }

  return Object.freeze({
    HOTSPOT_TYPES,
    CASES,
    cases: CASES,
    FIRST_CASE: CASES[0],
    firstCase: CASES[0],
    getCaseById,
    getEvidenceById,
    getHotspotById
  });
});
