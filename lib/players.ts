import { Player, PlayerRole, PlayerNationality } from "@/types/game";

function p(
  id: string,
  name: string,
  role: PlayerRole,
  nationality: PlayerNationality,
  basePrice: number,
  battingRating: number,
  bowlingRating: number,
  wicketkeeperRating = 0
): Player {
  return {
    id,
    name,
    role,
    nationality,
    basePrice,
    battingRating,
    bowlingRating,
    wicketkeeperRating,
    currentForm: 0,
    injured: false,
    injuredForMatches: 0,
    soldTo: null,
    soldPrice: null,
  };
}

// Base price tiers (in cr):
// 2.0  → Superstars (Virat, Rohit, Bumrah, Stokes, Buttler...)
// 1.5  → Stars (Jadeja, Shami, Rashid, Russell...)
// 1.0  → Good capped players
// 0.5  → Fringe capped / decent uncapped
// 0.2  → Raw uncapped talent

export const PLAYER_POOL: Player[] = [

  // ── INDIA — CAPPED ─────────────────────────────────────
  p("virat",      "Virat Kohli",         "batsman",      "India", 2,   95, 10),
  p("rohit",      "Rohit Sharma",        "batsman",      "India", 2,   93, 10),
  p("bumrah",     "Jasprit Bumrah",      "bowler",       "India", 2,   20, 97),
  p("hardik",     "Hardik Pandya",       "allrounder",   "India", 2,   80, 82),
  p("klrahul",    "KL Rahul",            "wicketkeeper", "India", 2,   88, 10, 90),
  p("shubman",    "Shubman Gill",        "batsman",      "India", 1.5, 89, 10),
  p("surya",      "Suryakumar Yadav",    "batsman",      "India", 1.5, 91, 10),
  p("ishan",      "Ishan Kishan",        "wicketkeeper", "India", 1,   82, 10, 85),
  p("shreyas",    "Shreyas Iyer",        "batsman",      "India", 1.5, 85, 10),
  p("ruturaj",    "Ruturaj Gaikwad",     "batsman",      "India", 1,   84, 10),
  p("sanju",      "Sanju Samson",        "wicketkeeper", "India", 1,   83, 10, 86),
  p("axar",       "Axar Patel",          "allrounder",   "India", 1,   72, 80),
  p("jadeja",     "Ravindra Jadeja",     "allrounder",   "India", 1.5, 75, 84),
  p("ashwin",     "Ravichandran Ashwin", "allrounder",   "India", 1,   65, 86),
  p("siraj",      "Mohammed Siraj",      "bowler",       "India", 1,   15, 88),
  p("shami",      "Mohammed Shami",      "bowler",       "India", 1.5, 18, 90),
  p("kuldeep",    "Kuldeep Yadav",       "bowler",       "India", 1,   22, 85),
  p("yuzi",       "Yuzvendra Chahal",    "bowler",       "India", 1,   18, 84),
  p("avesh",      "Avesh Khan",          "bowler",       "India", 0.5, 15, 79),
  p("deepak",     "Deepak Chahar",       "allrounder",   "India", 1,   45, 78),
  p("arshdeep",   "Arshdeep Singh",      "bowler",       "India", 1,   20, 82),
  p("tilak",      "Tilak Varma",         "batsman",      "India", 1,   80, 20),
  p("rinku",      "Rinku Singh",         "batsman",      "India", 1,   78, 15),
  p("yashasvi",   "Yashasvi Jaiswal",    "batsman",      "India", 1.5, 86, 10),
  p("dhruv",      "Dhruv Jurel",         "wicketkeeper", "India", 0.5, 70, 10, 78),
  p("nitish",     "Nitish Rana",         "allrounder",   "India", 0.5, 72, 55),
  p("washington", "Washington Sundar",   "allrounder",   "India", 1,   68, 75),
  p("ravi_b",     "Ravi Bishnoi",        "bowler",       "India", 1,   18, 80),
  p("naman",      "Naman Dhir",          "allrounder",   "India", 0.5, 65, 55),
  p("rahul_t",    "Rahul Tewatia",       "allrounder",   "India", 0.5, 70, 60),

  // ── INDIA — UNCAPPED ───────────────────────────────────
  p("ayush_b",    "Ayush Badoni",        "batsman",      "India", 1,   72, 15),
  p("shaik",      "Shaik Rasheed",       "batsman",      "India", 0.5, 65, 10),
  p("kumar_k",    "Kumar Kushagra",      "wicketkeeper", "India", 0.5, 62, 10, 70),
  p("raj_b",      "Raj Bawa",            "allrounder",   "India", 0.5, 63, 60),
  p("vicky",      "Vicky Ostwal",        "bowler",       "India", 0.5, 12, 72),
  p("aklunk",     "Akash Maharaj Singh", "bowler",       "India", 0.5, 10, 70),
  p("yash_d",     "Yash Dayal",          "bowler",       "India", 1,   14, 73),
  p("abhish_p",   "Abhishek Porel",      "wicketkeeper", "India", 0.5, 60, 10, 68),
  p("sai_sudh",   "Sai Sudharsan",       "batsman",      "India", 1,   74, 10),
  p("nehal",      "Nehal Wadhera",       "batsman",      "India", 0.5, 64, 15),
  p("prabhsim",   "Prabhsimran Singh",   "wicketkeeper", "India", 1,   68, 10, 72),
  p("shivam_d",   "Shivam Dube",         "allrounder",   "India", 1,   70, 58),
  p("anukul",     "Anukul Roy",          "allrounder",   "India", 0.5, 55, 65),
  p("ramandeep",  "Ramandeep Singh",     "allrounder",   "India", 0.5, 62, 55),
  p("harshit",    "Harshit Rana",        "bowler",       "India", 1,   16, 74),
  p("mukesh_k",   "Mukesh Kumar",        "bowler",       "India", 1,   12, 73),
  p("mayank_y",   "Mayank Yadav",        "bowler",       "India", 1,   14, 76),
  p("rishi_d",    "Riyan Parag",         "allrounder",   "India", 1,   70, 52),
  p("arshin",     "Arshin Kulkarni",     "allrounder",   "India", 0.2, 58, 55),
  p("aash_sh",    "Aashutosh Sharma",    "allrounder",   "India", 0.2, 60, 58),
  p("devdutt",    "Devdutt Padikkal",    "batsman",      "India", 1,   71, 10),
  p("vishnu_v",   "Vishnu Vinod",        "wicketkeeper", "India", 0.2, 58, 10, 64),
  p("sanvir",     "Sanvir Singh",        "allrounder",   "India", 0.2, 55, 52),
  p("tanush",     "Tanush Kotian",       "allrounder",   "India", 0.2, 52, 60),
  p("upendra",    "Upendra Yadav",       "wicketkeeper", "India", 0.2, 56, 10, 65),
  p("suyash",     "Suyash Sharma",       "bowler",       "India", 0.2, 10, 68),
  p("shubh_dub",  "Shubham Dubey",       "allrounder",   "India", 0.2, 55, 56),
  p("nishant",    "Nishant Sindhu",      "allrounder",   "India", 0.2, 54, 58),
  p("karn_sh",    "Karn Sharma",         "bowler",       "India", 0.5, 22, 70),
  p("manav_s",    "Manav Suthar",        "bowler",       "India", 0.2, 10, 66),

  // ── AUSTRALIA ──────────────────────────────────────────
  p("maxwell",    "Glenn Maxwell",       "allrounder",   "Australia", 1.5, 85, 72),
  p("warner",     "David Warner",        "batsman",      "Australia", 1.5, 88, 10),
  p("cummins",    "Pat Cummins",         "allrounder",   "Australia", 2,   55, 91),
  p("starc",      "Mitchell Starc",      "bowler",       "Australia", 2,   30, 90),
  p("stoinis",    "Marcus Stoinis",      "allrounder",   "Australia", 1,   78, 74),
  p("inglis",     "Josh Inglis",         "wicketkeeper", "Australia", 0.5, 74, 10, 82),
  p("head",       "Travis Head",         "batsman",      "Australia", 1.5, 87, 35),
  p("hazlewood",  "Josh Hazlewood",      "bowler",       "Australia", 1.5, 15, 88),
  p("carey",      "Alex Carey",          "wicketkeeper", "Australia", 0.5, 72, 10, 80),
  p("green",      "Cameron Green",       "allrounder",   "Australia", 1,   76, 75),

  // ── ENGLAND ────────────────────────────────────────────
  p("stokes",     "Ben Stokes",          "allrounder",   "England", 2,   82, 86),
  p("buttler",    "Jos Buttler",         "wicketkeeper", "England", 2,   91, 10, 92),
  p("archer",     "Jofra Archer",        "bowler",       "England", 1.5, 25, 89),
  p("livingstone","Liam Livingstone",    "allrounder",   "England", 1,   80, 72),
  p("bairstow",   "Jonny Bairstow",      "wicketkeeper", "England", 1,   84, 10, 86),
  p("salt",       "Phil Salt",           "wicketkeeper", "England", 1,   80, 10, 83),
  p("curran",     "Sam Curran",          "allrounder",   "England", 1.5, 70, 80),
  p("woakes",     "Chris Woakes",        "allrounder",   "England", 1,   58, 78),
  p("topley",     "Reece Topley",        "bowler",       "England", 0.5, 12, 78),
  p("moeen",      "Moeen Ali",           "allrounder",   "England", 1,   72, 76),

  // ── SOUTH AFRICA ───────────────────────────────────────
  p("rabada",     "Kagiso Rabada",       "bowler",       "South Africa", 2,   25, 93),
  p("klaasen",    "Heinrich Klaasen",    "wicketkeeper", "South Africa", 1.5, 87, 10, 88),
  p("markram",    "Aiden Markram",       "allrounder",   "South Africa", 1,   82, 72),
  p("nortje",     "Anrich Nortje",       "bowler",       "South Africa", 1,   18, 88),
  p("miller",     "David Miller",        "batsman",      "South Africa", 1,   83, 10),
  p("jansen",     "Marco Jansen",        "allrounder",   "South Africa", 1,   55, 82),
  p("bavuma",     "Temba Bavuma",        "batsman",      "South Africa", 0.5, 76, 10),
  p("pretorius",  "Dwaine Pretorius",    "allrounder",   "South Africa", 0.5, 60, 70),

  // ── NEW ZEALAND ────────────────────────────────────────
  p("boult",      "Trent Boult",         "bowler",       "New Zealand", 1.5, 22, 90),
  p("williamson", "Kane Williamson",     "batsman",      "New Zealand", 1.5, 88, 20),
  p("conway",     "Devon Conway",        "wicketkeeper", "New Zealand", 1,   83, 10, 84),
  p("santner",    "Mitchell Santner",    "allrounder",   "New Zealand", 1,   65, 75),
  p("southee",    "Tim Southee",         "allrounder",   "New Zealand", 1,   40, 80),
  p("phillips",   "Glenn Phillips",      "allrounder",   "New Zealand", 1,   78, 65),
  p("bracewell",  "Michael Bracewell",   "allrounder",   "New Zealand", 0.5, 65, 68),
  p("latham",     "Tom Latham",          "wicketkeeper", "New Zealand", 0.5, 74, 10, 80),

  // ── WEST INDIES ────────────────────────────────────────
  p("russell",    "Andre Russell",       "allrounder",   "West Indies", 2,   86, 84),
  p("narine",     "Sunil Narine",        "allrounder",   "West Indies", 2,   78, 88),
  p("pooran",     "Nicholas Pooran",     "wicketkeeper", "West Indies", 1.5, 85, 10, 87),
  p("hetmyer",    "Shimron Hetmyer",     "batsman",      "West Indies", 1,   82, 10),
  p("pollard",    "Kieron Pollard",      "allrounder",   "West Indies", 1,   78, 70),
  p("holder",     "Jason Holder",        "allrounder",   "West Indies", 1,   62, 83),
  p("joseph",     "Alzarri Joseph",      "bowler",       "West Indies", 1,   20, 85),
  p("king",       "Brandon King",        "batsman",      "West Indies", 0.5, 75, 10),
  p("thomas",     "Oshane Thomas",       "bowler",       "West Indies", 0.5, 15, 76),

  // ── SRI LANKA ──────────────────────────────────────────
  p("hasaranga",  "Wanindu Hasaranga",   "allrounder",   "Sri Lanka", 1.5, 68, 87),
  p("mathews",    "Angelo Mathews",      "allrounder",   "Sri Lanka", 1,   74, 68),
  p("nissanka",   "Pathum Nissanka",     "batsman",      "Sri Lanka", 0.5, 78, 10),
  p("theekshana", "Maheesh Theekshana",  "bowler",       "Sri Lanka", 1,   20, 82),
  p("chameera",   "Dushmantha Chameera", "bowler",       "Sri Lanka", 0.5, 18, 80),
  p("gunathilaka","Danushka Gunathilaka","batsman",      "Sri Lanka", 0.5, 74, 10),
  p("rajapaksa",  "Bhanuka Rajapaksa",   "batsman",      "Sri Lanka", 0.5, 75, 10),

  // ── AFGHANISTAN ────────────────────────────────────────
  p("rashid",     "Rashid Khan",         "allrounder",   "Afghanistan", 2,   65, 94),
  p("nabi",       "Mohammad Nabi",       "allrounder",   "Afghanistan", 1,   68, 80),
  p("mujeeb",     "Mujeeb ur Rahman",    "bowler",       "Afghanistan", 1,   18, 84),
  p("zadran",     "Fazalhaq Farooqi",    "bowler",       "Afghanistan", 0.5, 15, 80),
  p("ibrahim",    "Ibrahim Zadran",      "batsman",      "Afghanistan", 0.5, 74, 10),
  p("gulbadin",   "Gulbadin Naib",       "allrounder",   "Afghanistan", 0.5, 62, 68),
];

// Shuffle for auction order
export function getAuctionOrder(): Player[] {
  const pool = [...PLAYER_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function getPlayerById(id: string): Player | undefined {
  return PLAYER_POOL.find((p) => p.id === id);
}