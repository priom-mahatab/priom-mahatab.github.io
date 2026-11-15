// ─────────────────────────────────────────────────────────────────────────────
//  ALL SITE CONTENT LIVES HERE. Edit this file; you shouldn't need to touch main.js.
//
//  Images: put files in /assets and reference them by path, e.g. "assets/projects/rover.jpg".
//  Leave `image: null` and the card draws a generated occupancy-grid pattern instead.
//  Card images are cropped to roughly 3:1.4 (landscape). The panel gallery shows images uncropped.
// ─────────────────────────────────────────────────────────────────────────────

export const profile = {
  name: "Zohaer Al Mahatab",
  role: "Robotics & Machine Learning Intern @ Valkyrie",
  status: "Computer Science & Math @ St. Edward's University",
  tagline: "I build systems that perceive, plan and learn — from simulation to hardware.",
  location: "Austin, TX, United States",
  timezone: "America/Chicago", // for the live clock next to "Based in" (IANA name)
  email: "zohaeral1603@gmail.com",
  // Portrait used for the point-cloud on the landing screen.
  // Best result: a head-and-shoulders photo with the background removed (transparent PNG).
  // A normal photo also works; edges are faded out automatically.
  portrait: "assets/me-cutout.png", // background-removed copy of assets/me.jpg
  about: [
    "I am a Data Scientist converted to Robotics & Machine Learning Engineer due to access to hardware at our Robotics Lab in Valkyrie. Systems that can actually be perceived in a real environment instead of a screen excite me more which is why I switched towards this role.",
    "I am currently working on different sorts of autonomous systems (land and air). I am happy to connect to anyone who is working in a similar domain or wants to discuss any of my projects.",
  ],
  links: [
    { label: "GitHub", url: "https://github.com/priom-mahatab" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/mahatab05/" },
    { label: "Résumé (PDF)", url: "https://drive.google.com/file/d/1wsKzRyeJXdc0HVTkV6qpygV93aQXaNmv/view?usp=sharing" },
  ],
};

// Each section becomes a waypoint the camera flies through, followed by its cards.
// `code` is the short prefix shown on cards (EXP_01, PRJ_02 …).
export const sections = [
  {
    id: "experience",
    label: "Experience",
    code: "EXP",
    intro: "Where I've worked",
    items: [
      {
        title: "Robotics & Machine Learning Intern",
        org: "Valkyrie",
        date: "May 2026 - Present",
        location: "Austin, TX",
        summary: "Worked on building mini robotics systems and training custom models",
        details: [
          "Implemented Computer Vision systems for drones and rovers",
          "Trained XGBoost model for NFL Win Probability prediction",
          "Developed algorithm for streamlining Real Estate investment process"
        ],
        tags: ["Python", "PyTorch", "XGBoost", "ROS 2", "C++", "RaspberryPi", "Arduino", "Perception", "3D Printing"],
        image: "assets/valkyrie.svg", // vertical logo with tagline; logos are shown whole, not cropped
        gallery: [],
        links: ["https://www.valkyrie.science/"],
      },
      {
        title: "Data Scientist",
        org: "St. Edward's University",
        date: "Nov 2024 — Dec 2025",
        summary: "Work with radiosonde data for record correction.",
        details: ["Analyzed 500+ meteorological datasets using Python libraries to identify bias in radiosondes",
          "Identified bias between iMet-4 and RS41 radiosonde measurements at different altitudes"
        ],
        tags: ["Python", "MetPy", "Pandas", "ACT-Atmos", "Matplotlib"],
        image: "assets/seu_logo.jpg",
        gallery: [],
        links: ["https://www.stedwards.edu/"],
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    code: "PRJ",
    intro: "Things I've built",
    items: [
      {
        title: "Autonomous Rover Bumblebee",
        subtitle: "Vision-based approach to autonomous navigation",
        date: "2026",
        // summary: "Placeholder: what it is, why you built it, how it works.",
        details: ["YOLOv8n Object Detection", "Path Planning via DFS", "Lane Detection via custom Computer Vision Pipeline", "MobileNetv3 Model to run on RaspberryPi 3."],
        tags: ["YOLO", "ROS 2", "Computer Vision", "Perception"],
        image: "assets/projects/rover.jpg", // web-size copy of rover.png
        gallery: ["assets/projects/rover_2.jpg",], // e.g. ["assets/projects/rover-1.jpg", "assets/projects/rover-2.jpg"]
        links: [{ label: "GitHub", url: "https://github.com/priom-mahatab/bumblebee" }],
      },
      {
        title: "NFL Win Probability Model",
        subtitle: "Prediction model to compete on prediction markets",
        date: "2026",
        // summary: "Placeholder.",
        details: ["XGBoost Classifier trained on NFL PbP data", "Latency Analysis for Kalshi and Polymarket"],
        tags: ["Machine Learning", "Kalshi", "Polymarket", "HFT"],
        image: "assets/projects/nfl.png",
        imageStyle: "dark", // light chart → dark version (keeps its colours) so it sits in the dark site
        imageFocus: 0, // crop from the top: keeps the title and both price lines, hides the volume bars
        gallery: [],
        links: [{ label: "Private Repo", url: "#"}],
      },
      {
        title: "Prof Peek",
        subtitle: "Inject RateMyProfessor information into registration banner",
        date: "2025",
        // summary: "Placeholder.",
        details: ["Chrome Extension",],
        tags: ["GraphQL", "Node.js", "JavaScript", "TypeScript"],
        image: "assets/projects/profpeek.jpg", // screenshot from the repo README (images/sample.png)
        imageFocus: 0, // keep the top: the popup and the first rated rows
        gallery: [],
        links: [{ label: "Github", url: "https://github.com/priom-mahatab/Prof-Peek"}, {label: "Extension", url: "https://chromewebstore.google.com/detail/prof-peek-seu/gnkgbnaejgmdnkopodnfmcfodgbfahmd?utm_source=item-share-cb"}],
      },
      
    ],
  },
  {
    id: "achievements",
    label: "Achievements",
    code: "ACH",
    intro: "Awards, competitions, publications",
    items: [
      {
        title: "ICPC Regionals — 3rd Place",
        org: "International Collegiate Programming Contest",
        date: "2025",
        summary: "Obtained Bronze medal (Gold on-site) in ICPC South regionals 2025",
        tags: ["Competition"],
        image: "assets/achievements/icpc.png", // official ICPC logo (icpc.global)
        imageFit: "contain",
        gallery: [],
        links: ["https://nasouth25.kattis.com/contests/nasouth25d2/standings/scusa/all"],
      },
      {
        title: "Bloomberg Trading Challenge — Top 5%",
        org: "Bloomberg",
        date: "2025",
        summary: "Obtained 102nd place globally and 35th in North America",
        tags: ["Competition"],
        image: "assets/achievements/bloomberg-white.svg", // Bloomberg wordmark, white for the dark theme
        gallery: [],
        links: ["https://portal.bloombergforeducation.com/trading_challenges/8/leaderboard"],
      },
      {
        title: "N-dimensional Auto Clustering of HSRL Lidars",
        org: "Atmospheric Radiation Measurement",
        date: "2026",
        summary: "Unsupervised ML pipeline with automated k-selection to identify defacto aerosol types",
        tags: ["Publication"],
        image: null,
        visual: { kind: "clusters", k: 4, big: "auto-k", label: "HSRL lidar · unsupervised", note: "Clusters aerosol types, picking the number of clusters automatically" },
        gallery: [],
        links: ["https://zenodo.org/records/20936643"],
      },
      {
        title: "Moreau Scholarship & Martin Scholarship",
        org: "St. Edward's University",
        date: "2024, 2025, 2026",
        summary: "Placeholder.",
        tags: ["Award"],
        image: "assets/seu_logo.jpg",
        imageFit: "contain", // the whole logo, centred
        gallery: [],
        links: [],
      },
    ],
  },
  {
    id: "about",
    label: "About me",
    code: "ABT",
    intro: "The human in the loop",
    // Photos of you. Title = caption.
    items: [
      { title: "Soccer", subtitle: "Hobby", image: "assets/about/soccer-hq.jpg", imageFocus: 0, summary: "I love playing soccer and support FC Barcelona.", tags: [] },
      { title: "Rock Climbing", subtitle: "Hobby", image: "assets/about/rock_climbing.jpeg", imageCrop: [0, 0.27, 1, 0.51], imageFit: "blur", summary: "I casually rock climb instead of climbing on the Leetcode Leaderboard", tags: [] },
      // { title: "Photo caption", subtitle: "Where / when", image: null, summary: "Placeholder.", tags: [] },
    ],
  },
];
