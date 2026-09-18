/**
 * Generates data/notes.jsonl: 120 template-generated records + 30
 * hand-written hard cases. Labels for the template-generated records are
 * derived directly from the template parameters that also produced the note
 * text, so they are exact by construction - there is no model in the loop
 * for the dataset itself. See README "Dataset" section.
 *
 * Deterministic: running this script twice with the same SEED produces byte
 * identical output (verified in test/make-dataset.test.ts).
 */
import { writeFileSync } from "node:fs";
import { resolveRelativeDate } from "../src/lib/dates.js";
import type { ActivityRecord, ActivityType, NoteRecord } from "../src/types.js";

const SEED = 42;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function pick<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

function pickSome<T>(arr: readonly T[], min: number, max: number): T[] {
  const count = Math.min(arr.length, min + Math.floor(rng() * (max - min + 1)));
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

function maybe(probability: number): boolean {
  return rng() < probability;
}

const OFFICES = [
  "Silver Birch Dental",
  "Maplewood Family Dentistry",
  "Harborview Dental Group",
  "Bright Smiles of Cedar Falls",
  "Northgate Dental Associates",
  "Lakeside Pediatric Dentistry",
  "Oakhollow Dental Studio",
  "Riverbend Family Dental",
  "Summit Ridge Orthodontics",
  "Willowbrook Dental Care",
  "Pinecrest Dental Partners",
  "Meadowview Smiles",
  "Stonegate Dental Center",
  "Fairhaven Family Dentistry",
  "Cobblestone Dental Studio",
  "Brookfield Dental Arts",
  "Ashford Dental Group",
  "Twin Oaks Family Dentistry",
  "Copper Creek Dental",
  "Hillcrest Smile Studio",
];

const CONTACTS = [
  "Dr. Alan Foster",
  "Dr. Priya Nair",
  "Dr. Marcus Webb",
  "Dr. Lena Ortiz",
  "Dr. Grace Kim",
  "office manager Denise",
  "office manager Ruth",
  "hygienist Talia",
  "hygienist Ben",
  "front desk lead Carla",
  "Dr. Owen Blake",
  "Dr. Sophie Marsh",
];

const PRODUCTS = [
  "the SmileClear aligner kit",
  "the QuickScan intraoral camera",
  "the ProSeal sealant system",
  "the BrightCure curing light",
  "the FlexRail chair upgrade",
  "the ComfortBite impression trays",
  "the SteriFlow sterilizer",
  "the ChartWise software bundle",
];

const OUTCOMES: Record<ActivityType, string[]> = {
  call: [
    "confirmed they are still interested but want pricing in writing",
    "said they need to check with their partner before deciding",
    "was quick and mostly just a status check",
    "went to voicemail and I left a message",
  ],
  email: [
    "sent over the updated quote and answered a couple of questions",
    "followed up on last week's visit with pricing details",
    "was a short reply confirming receipt of the brochure",
  ],
  visit: [
    "walked the office and saw where the new equipment would go",
    "met with the whole team and did a quick demo of the tablet app",
    "was mostly small talk since the doctor was with a patient",
    "went well, they seem ready to move forward",
  ],
  note: [
    "just a reminder to myself about their renewal timing",
    "logging a quick observation from the parking lot conversation",
  ],
  demo: [
    "showed the full workflow on the tablet and they asked good questions",
    "ran short because a patient emergency came up halfway through",
    "went great, the hygienist loved the scan speed",
  ],
  quote: [
    "put together numbers for the three tier options",
    "sent a formal quote after they asked for one in writing",
  ],
};

const FILLERS = [
  "um so",
  "okay so",
  "alright",
  "quick note",
  "hey it's me",
  "so",
  "",
];

const TYPOS: Array<[string, string]> = [
  ["appointment", "appoinment"],
  ["definitely", "definately"],
  ["schedule", "schedual"],
  ["received", "recieved"],
  ["interested", "intrested"],
];

function applyTypo(text: string): string {
  if (!maybe(0.35)) return text;
  const [correct, typo] = pick(TYPOS);
  return text.includes(correct) ? text.replace(correct, typo) : text;
}

const RELATIVE_DATE_PHRASES = [
  "tomorrow",
  "next week",
  "end of month",
  "next tues",
  "next friday",
  "in 3 days",
  "in 2 weeks",
  "next month",
];

const ACTIVITY_TYPES_LIST: ActivityType[] = [
  "call",
  "email",
  "visit",
  "note",
  "demo",
  "quote",
];

interface GeneratedNote {
  note: string;
  label: ActivityRecord;
}

function buildTemplateRecord(notedAt: string): GeneratedNote {
  const activityType = pick(ACTIVITY_TYPES_LIST);
  const office = pick(OFFICES);
  const contacts = pickSome(CONTACTS, 1, 2);
  const hasProduct = maybe(0.6);
  const products = hasProduct ? pickSome(PRODUCTS, 1, 1) : [];
  const outcome = pick(OUTCOMES[activityType]);
  const filler = pick(FILLERS);

  const hasNextAction = maybe(0.75);
  let nextAction: string | null = null;
  let nextActionDate: string | null = null;
  let nextActionPhrase = "";
  if (hasNextAction) {
    const datePhrase = pick(RELATIVE_DATE_PHRASES);
    nextActionDate = resolveRelativeDate(datePhrase, notedAt);
    const actionVerb = pick([
      "send over pricing",
      "follow up with a call",
      "schedule the install",
      "drop off samples",
      "send the contract",
      "check back in",
    ]);
    nextAction = `${actionVerb} by ${datePhrase}`;
    nextActionPhrase = ` I need to ${actionVerb} ${datePhrase}.`;
  }

  const contactsPhrase = contacts.join(" and ");
  const productPhrase =
    products.length > 0 ? ` We talked about ${products[0]}.` : "";
  let noteBody =
    `${filler ? filler + ", " : ""}stopped by ${office}, talked to ${contactsPhrase}. Visit ${outcome}.${productPhrase}${nextActionPhrase}`.trim();
  noteBody = applyTypo(noteBody);

  const confidence =
    hasNextAction && hasProduct ? "high" : maybe(0.5) ? "medium" : "low";

  const label: ActivityRecord = {
    office_name: office,
    activity_type: activityType,
    contacts,
    products_mentioned: products,
    outcome: `Visit ${outcome}.`,
    next_action: nextAction,
    next_action_date: nextActionDate,
    follow_up_needed: hasNextAction,
    confidence,
  };

  return { note: noteBody, label };
}

function generateTemplateRecords(count: number): NoteRecord[] {
  const records: NoteRecord[] = [];
  let dayOffset = 0;
  for (let i = 0; i < count; i += 1) {
    // Spread notes across a 2026 calendar so relative dates exercise month
    // and year boundaries naturally.
    const baseDate = new Date(Date.UTC(2026, 0, 1));
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    dayOffset += 1 + Math.floor(rng() * 3);
    const notedAt = baseDate.toISOString().slice(0, 10);
    const { note, label } = buildTemplateRecord(notedAt);
    records.push({
      id: `tmpl-${String(i + 1).padStart(3, "0")}`,
      noted_at: notedAt,
      note,
      label,
    });
  }
  return records;
}

function handWrittenRecords(): NoteRecord[] {
  const records: NoteRecord[] = [
    {
      id: "hard-001",
      noted_at: "2026-03-12",
      note: "so I hit both Maplewood Family Dentistry and Riverbend Family Dental back to back this morning. At Maplewood, Dr. Priya Nair said the aligner kit demo went great and she wants a quote by next friday. Riverbend was quick, front desk lead Carla just took a brochure, no real interest yet.",
      label: {
        office_name: "Maplewood Family Dentistry",
        activity_type: "visit",
        contacts: ["Dr. Priya Nair"],
        products_mentioned: ["the SmileClear aligner kit"],
        outcome:
          "Demoed the aligner kit at Maplewood; Riverbend visit was brief with no real interest.",
        next_action: "send quote by next friday",
        next_action_date: resolveRelativeDate("next friday", "2026-03-12"),
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-002",
      noted_at: "2026-04-02",
      note: "Was supposed to visit Harborview Dental Group today but Dr. Marcus Webb called and cancelled, said the office had a plumbing emergency. Nothing to report.",
      label: {
        office_name: "Harborview Dental Group",
        activity_type: "visit",
        contacts: ["Dr. Marcus Webb"],
        products_mentioned: [],
        outcome:
          "Visit was cancelled by the office due to a plumbing emergency.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-003",
      noted_at: "2026-05-20",
      note: "Called Northgate Dental Associates, phone tag with office manager Denise again, third time this week. No update.",
      label: {
        office_name: "Northgate Dental Associates",
        activity_type: "call",
        contacts: ["office manager Denise"],
        products_mentioned: [],
        outcome:
          "Phone tag with the office manager for the third time this week, no conversation happened.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-004",
      noted_at: "2026-06-08",
      note: "Quick visit to Oakhollow Dental Studio, Dr. Lena Ortiz mentioned she'd heard of the QuickScan camera from a rep at a conference but we didn't actually get into it, ran out of time.",
      label: {
        office_name: "Oakhollow Dental Studio",
        activity_type: "visit",
        contacts: ["Dr. Lena Ortiz"],
        products_mentioned: [],
        outcome:
          "Short visit; ran out of time to discuss the camera the doctor had heard about elsewhere.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "medium",
      },
    },
    {
      id: "hard-005",
      noted_at: "2026-07-14",
      note: "Oh great, ANOTHER fantastic visit to Summit Ridge Orthodontics. Dr. Owen Blake kept me waiting forty five minutes and then said he wasn't interested in anything right now. Really productive use of my afternoon.",
      label: {
        office_name: "Summit Ridge Orthodontics",
        activity_type: "visit",
        contacts: ["Dr. Owen Blake"],
        products_mentioned: [],
        outcome:
          "The doctor kept the rep waiting 45 minutes then declined any interest.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-006",
      noted_at: "2026-08-25",
      note: "Sent Willowbrook Dental Care the full quote for the SteriFlow sterilizer and the ChartWise software bundle. Office manager Ruth said budget is tight this quarter, no follow up planned on their end.",
      label: {
        office_name: "Willowbrook Dental Care",
        activity_type: "quote",
        contacts: ["office manager Ruth"],
        products_mentioned: [
          "the SteriFlow sterilizer",
          "the ChartWise software bundle",
        ],
        outcome:
          "Sent a formal quote covering the sterilizer and software bundle; budget is tight this quarter.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-007",
      noted_at: "2026-12-18",
      note: "Emailed Pinecrest Dental Partners the demo recap, Dr. Grace Kim wants to pick this back up after the holiday.",
      label: {
        office_name: "Pinecrest Dental Partners",
        activity_type: "email",
        contacts: ["Dr. Grace Kim"],
        products_mentioned: [],
        outcome:
          "Sent the demo recap; the doctor wants to resume after the holiday.",
        next_action: "follow up after the holiday",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "low",
      },
    },
    {
      id: "hard-008",
      noted_at: "2026-12-29",
      note: "Meadowview Smiles demo went really well, hygienist Talia loved the scan speed on the QuickScan camera. She wants me back on jan 3 to talk numbers with the doctor.",
      label: {
        office_name: "Meadowview Smiles",
        activity_type: "demo",
        contacts: ["hygienist Talia"],
        products_mentioned: ["the QuickScan intraoral camera"],
        outcome:
          "Demo went well; the hygienist loved the scan speed and wants a pricing follow up.",
        next_action: "return to talk pricing on jan 3",
        next_action_date: resolveRelativeDate("jan 3", "2026-12-29"),
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-009",
      noted_at: "2026-09-30",
      note: "Stonegate Dental Center, talked to Dr. Sophie Marsh about the ProSeal sealant system, she wants to revisit end of next month once their new hygienist starts.",
      label: {
        office_name: "Stonegate Dental Center",
        activity_type: "visit",
        contacts: ["Dr. Sophie Marsh"],
        products_mentioned: ["the ProSeal sealant system"],
        outcome:
          "Discussed the sealant system; the doctor wants to revisit once a new hygienist starts.",
        next_action: "revisit end of next month",
        next_action_date: resolveRelativeDate(
          "end of next month",
          "2026-09-30",
        ),
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-010",
      noted_at: "2026-02-11",
      note: "note to self, Fairhaven Family Dentistry's contract renews soon, need to check the exact date before I call them.",
      label: {
        office_name: "Fairhaven Family Dentistry",
        activity_type: "note",
        contacts: [],
        products_mentioned: [],
        outcome:
          "Reminder that the office's contract renewal is coming up and the exact date needs checking.",
        next_action: "check renewal date before calling",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "low",
      },
    },
    {
      id: "hard-011",
      noted_at: "2026-01-05",
      note: "Cobblestone Dental Studio call with Dr. Alan Foster, he's traveling until next month so nothing to schedule yet, just checking in.",
      label: {
        office_name: "Cobblestone Dental Studio",
        activity_type: "call",
        contacts: ["Dr. Alan Foster"],
        products_mentioned: [],
        outcome:
          "Check-in call; the doctor is traveling and unavailable to schedule anything yet.",
        next_action: "check back in next month",
        next_action_date: resolveRelativeDate("next month", "2026-01-05"),
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-012",
      noted_at: "2026-11-03",
      note: "Brookfield Dental Arts visit, Dr. Marcus Webb signed off on the FlexRail chair upgrade quote we sent last week, install team will reach out separately.",
      label: {
        office_name: "Brookfield Dental Arts",
        activity_type: "visit",
        contacts: ["Dr. Marcus Webb"],
        products_mentioned: ["the FlexRail chair upgrade"],
        outcome: "The doctor signed off on last week's chair upgrade quote.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-013",
      noted_at: "2026-06-30",
      note: "Ashford Dental Group, spoke with both Dr. Grace Kim and hygienist Ben, they want the ComfortBite trays sample pack sent over, no rush on timing.",
      label: {
        office_name: "Ashford Dental Group",
        activity_type: "visit",
        contacts: ["Dr. Grace Kim", "hygienist Ben"],
        products_mentioned: ["the ComfortBite impression trays"],
        outcome:
          "They requested a sample pack of the impression trays with no rush on timing.",
        next_action: "send sample pack",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-014",
      noted_at: "2026-08-01",
      note: "Twin Oaks Family Dentistry email thread with office manager Denise, she just confirmed she got the brochure, nothing else.",
      label: {
        office_name: "Twin Oaks Family Dentistry",
        activity_type: "email",
        contacts: ["office manager Denise"],
        products_mentioned: [],
        outcome: "Received a short confirmation that the brochure arrived.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-015",
      noted_at: "2026-03-27",
      note: "Copper Creek Dental, Dr. Owen Blake wants a formal quote for the BrightCure light, no other products, keep it simple he said.",
      label: {
        office_name: "Copper Creek Dental",
        activity_type: "quote",
        contacts: ["Dr. Owen Blake"],
        products_mentioned: ["the BrightCure curing light"],
        outcome:
          "Preparing a formal quote for the curing light only, per the doctor's request to keep it simple.",
        next_action: "send formal quote",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-016",
      noted_at: "2026-10-31",
      note: "Hillcrest Smile Studio note to self: their lease renegotiation might delay any equipment purchase this year, keep an eye on it.",
      label: {
        office_name: "Hillcrest Smile Studio",
        activity_type: "note",
        contacts: [],
        products_mentioned: [],
        outcome:
          "Their lease renegotiation may delay equipment purchases this year.",
        next_action: "monitor lease situation",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "low",
      },
    },
    {
      id: "hard-017",
      noted_at: "2026-12-24",
      note: "Silver Birch Dental demo of the ChartWise bundle for Dr. Alan Foster and office manager Ruth, went long but they liked it, want to reconnect in 2 weeks.",
      label: {
        office_name: "Silver Birch Dental",
        activity_type: "demo",
        contacts: ["Dr. Alan Foster", "office manager Ruth"],
        products_mentioned: ["the ChartWise software bundle"],
        outcome:
          "Long demo of the software bundle that went well; they want to reconnect soon.",
        next_action: "reconnect in 2 weeks",
        next_action_date: resolveRelativeDate("in 2 weeks", "2026-12-24"),
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-018",
      noted_at: "2026-05-05",
      note: "Bright Smiles of Cedar Falls, Dr. Sophie Marsh, quick call just to confirm the install date, everything on track.",
      label: {
        office_name: "Bright Smiles of Cedar Falls",
        activity_type: "call",
        contacts: ["Dr. Sophie Marsh"],
        products_mentioned: [],
        outcome: "Confirmed the install date is on track.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-019",
      noted_at: "2026-07-01",
      note: "Lakeside Pediatric Dentistry, hygienist Talia asked about the SmileClear kit but the office isn't pediatric-appropriate for aligners so I didn't push it, just noting the conversation happened.",
      label: {
        office_name: "Lakeside Pediatric Dentistry",
        activity_type: "note",
        contacts: ["hygienist Talia"],
        products_mentioned: [],
        outcome:
          "The hygienist asked about aligners but they are not appropriate for this pediatric office, so it was not pursued.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "medium",
      },
    },
    {
      id: "hard-020",
      noted_at: "2026-04-18",
      note: "Maplewood Family Dentistry again, Dr. Priya Nair confirmed the aligner order, wants delivery scheduled for end of month.",
      label: {
        office_name: "Maplewood Family Dentistry",
        activity_type: "call",
        contacts: ["Dr. Priya Nair"],
        products_mentioned: ["the SmileClear aligner kit"],
        outcome:
          "The doctor confirmed the aligner order and wants delivery scheduled.",
        next_action: "schedule delivery for end of month",
        next_action_date: resolveRelativeDate("end of month", "2026-04-18"),
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-021",
      noted_at: "2026-01-30",
      note: "Riverbend Family Dental, front desk lead Carla, dropped off ProSeal samples, no one available to talk products today.",
      label: {
        office_name: "Riverbend Family Dental",
        activity_type: "visit",
        contacts: ["front desk lead Carla"],
        products_mentioned: ["the ProSeal sealant system"],
        outcome:
          "Dropped off sealant samples; no decision-maker was available to discuss products.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "medium",
      },
    },
    {
      id: "hard-022",
      noted_at: "2026-09-09",
      note: "Harborview Dental Group email to Dr. Marcus Webb recapping today's visit and attaching the QuickScan spec sheet, need to follow up next tues if I don't hear back.",
      label: {
        office_name: "Harborview Dental Group",
        activity_type: "email",
        contacts: ["Dr. Marcus Webb"],
        products_mentioned: ["the QuickScan intraoral camera"],
        outcome: "Sent a recap with the camera spec sheet attached.",
        next_action: "follow up if no response by next tues",
        next_action_date: resolveRelativeDate("next tues", "2026-09-09"),
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-023",
      noted_at: "2026-02-28",
      note: "Northgate Dental Associates, office manager Denise wants pricing broken out by chair, so quoting the FlexRail upgrade per unit instead of as a bundle.",
      label: {
        office_name: "Northgate Dental Associates",
        activity_type: "quote",
        contacts: ["office manager Denise"],
        products_mentioned: ["the FlexRail chair upgrade"],
        outcome:
          "Preparing per-unit pricing for the chair upgrade instead of a bundle.",
        next_action: "send per-chair quote",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-024",
      noted_at: "2026-11-20",
      note: "Oakhollow Dental Studio, Dr. Lena Ortiz cancelled the demo we had scheduled, said next time she'll have the whole team there.",
      label: {
        office_name: "Oakhollow Dental Studio",
        activity_type: "demo",
        contacts: ["Dr. Lena Ortiz"],
        products_mentioned: [],
        outcome:
          "The scheduled demo was cancelled; the doctor wants the whole team present next time.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "medium",
      },
    },
    {
      id: "hard-025",
      noted_at: "2026-06-15",
      note: "Summit Ridge Orthodontics, spoke to Dr. Owen Blake and Dr. Sophie Marsh together, both interested in the SteriFlow sterilizer, want a joint quote for both locations.",
      label: {
        office_name: "Summit Ridge Orthodontics",
        activity_type: "visit",
        contacts: ["Dr. Owen Blake", "Dr. Sophie Marsh"],
        products_mentioned: ["the SteriFlow sterilizer"],
        outcome:
          "Both doctors are interested in the sterilizer and want a joint quote covering both locations.",
        next_action: "prepare joint quote for both locations",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "high",
      },
    },
    {
      id: "hard-026",
      noted_at: "2026-08-14",
      note: "Willowbrook Dental Care, quick note that hygienist Ben moved to a different office, will need a new contact there going forward.",
      label: {
        office_name: "Willowbrook Dental Care",
        activity_type: "note",
        contacts: ["hygienist Ben"],
        products_mentioned: [],
        outcome:
          "The hygienist contact has left; a new point of contact is needed.",
        next_action: "identify new contact",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-027",
      noted_at: "2026-12-01",
      note: "Pinecrest Dental Partners call with Dr. Grace Kim, she asked a lot about the ChartWise bundle but honestly I don't think we discussed pricing at all, just features.",
      label: {
        office_name: "Pinecrest Dental Partners",
        activity_type: "call",
        contacts: ["Dr. Grace Kim"],
        products_mentioned: ["the ChartWise software bundle"],
        outcome:
          "Discussed the software bundle's features at length but pricing did not come up.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "medium",
      },
    },
    {
      id: "hard-028",
      noted_at: "2026-03-03",
      note: "Stonegate Dental Center, Dr. Sophie Marsh signed the quote for the BrightCure light and the ComfortBite trays together, done deal.",
      label: {
        office_name: "Stonegate Dental Center",
        activity_type: "quote",
        contacts: ["Dr. Sophie Marsh"],
        products_mentioned: [
          "the BrightCure curing light",
          "the ComfortBite impression trays",
        ],
        outcome:
          "The doctor signed the quote covering both the curing light and impression trays.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
    {
      id: "hard-029",
      noted_at: "2026-07-22",
      note: "Fairhaven Family Dentistry, left a voicemail for Dr. Alan Foster, third attempt, might need to try email instead next.",
      label: {
        office_name: "Fairhaven Family Dentistry",
        activity_type: "call",
        contacts: ["Dr. Alan Foster"],
        products_mentioned: [],
        outcome:
          "Left a voicemail on the third attempt to reach the doctor by phone.",
        next_action: "try email instead",
        next_action_date: null,
        follow_up_needed: true,
        confidence: "medium",
      },
    },
    {
      id: "hard-030",
      noted_at: "2026-12-31",
      note: "Meadowview Smiles year end wrap up note, everything's quiet until the new year, nothing pending.",
      label: {
        office_name: "Meadowview Smiles",
        activity_type: "note",
        contacts: [],
        products_mentioned: [],
        outcome:
          "Year-end status is quiet with nothing pending until the new year.",
        next_action: null,
        next_action_date: null,
        follow_up_needed: false,
        confidence: "high",
      },
    },
  ];

  return records;
}

function main(): void {
  const templateRecords = generateTemplateRecords(120);
  const hardRecords = handWrittenRecords();
  const all = [...templateRecords, ...hardRecords];

  if (all.length !== 150) {
    throw new Error(`Expected 150 records, got ${all.length}`);
  }

  const lines = all.map((r) => JSON.stringify(r));
  writeFileSync("data/notes.jsonl", lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${all.length} records to data/notes.jsonl`);
}

main();
