// The course path as a piano roll: lanes are areas, columns are semesters, notes are courses.
// A gold line under each note shows the grade, the way a MIDI velocity lane shows how hard a key is struck.
(() => {
  const roll = document.getElementById('roll');
  const detail = document.getElementById('detail');
  if (!roll) return;

  const GH = 'https://github.com/Moein-Bagheri/';
  const repo = (name, path) => GH + name + (path ? '/tree/main/' + path : '');

  const terms = ["Fall '22", "Spr '23", "Fall '23", "Spr '24", "Fall '24", "Spr '25", "Fall '25", "Spr '26", "Fall '26"];
  const lanes = [
    { id: 'listen', name: 'Machine learning & language' },
    { id: 'signal', name: 'Math & signals' },
    { id: 'product', name: 'Software & product' },
    { id: 'found', name: 'Engineering foundations' },
  ];

  const courses = [
    // Machine learning & language
    { id: 'ml', lane: 'listen', term: 6, grade: 16.75, title: 'Machine Learning', skills: 'Modeling, optimization, evaluation',
      projects: [['Machine learning labs', repo('math-and-ml-labs', 'machine-learning')], ['Neural style transfer', repo('neural-style-transfer')]] },
    { id: 'ai', lane: 'listen', term: 7, grade: 18, title: 'Artificial Intelligence', skills: 'Search, reinforcement learning, logical reasoning',
      projects: [['Classical AI projects', repo('classical-ai-projects')]] },
    { id: 'dl', lane: 'listen', term: 7, grade: 18.5, title: 'Deep Learning', official: 'Special Topics 1', skills: 'Neural networks, sequence models, computer vision',
      projects: [['Deep ECG classification', repo('deep-ecg-lab')], ['Hand gesture recognition', repo('hand-gesture-recognition')], ['Smile detector', repo('smile-detector')]] },
    { id: 'nlp', lane: 'listen', term: 8, grade: 20, title: 'Language & Speech Processing', skills: 'Speech processing, language models, text classification',
      projects: [['Speech emotion recognition', repo('speech-emotion-recognition')], ['N-gram music completion', repo('ngram-music-completion')], ['Text classification with embeddings', repo('text-classification-embeddings')], ['NLP fundamentals', repo('nlp-fundamentals-labs')], ['Low-resource sentiment analysis design', repo('ai-system-design-studies', 'low-resource-sentiment')]] },
    { id: 'dm', lane: 'listen', term: 8, grade: 19.75, title: 'Data Mining', skills: 'Data analysis, retrieval-augmented generation',
      projects: [['Local research assistant', repo('local-research-assistant')], ['Credit limit prediction', repo('credit-limit-prediction')]] },
    { id: 'ir', lane: 'listen', term: 8, grade: 18.25, title: 'Information Retrieval', skills: 'Indexing, ranking, Persian text processing',
      projects: [['Persian information retrieval', repo('persian-information-retrieval')]] },
    { id: 'iot', lane: 'listen', term: 8, grade: 17.75, title: 'Internet of Things', skills: 'Edge AI, system design',
      projects: [['Edge AI maintenance design', repo('ai-system-design-studies', 'edge-ai-maintenance')]] },
    { id: 'capstone', lane: 'listen', term: 9, kind: 'capstone', title: 'Final project', status: 'In progress',
      skills: 'Persian–English code-switched speech recognition', projects: [] },

    // Math & signals
    { id: 'discrete', lane: 'signal', term: 2, grade: 17.7, title: 'Discrete Mathematics', skills: 'Proof, combinatorics, graphs', projects: [] },
    { id: 'prob', lane: 'signal', term: 4, grade: 19.25, title: 'Probability & Statistics', skills: 'Probability, statistical inference', projects: [] },
    { id: 'linalg', lane: 'signal', term: 5, grade: 18.87, title: 'Applied Linear Algebra', skills: 'Matrices, decompositions, least squares',
      projects: [['Linear algebra labs', repo('math-and-ml-labs', 'linear-algebra')]] },
    { id: 'signals', lane: 'signal', term: 8, grade: 20, title: 'Signals & Systems', skills: 'Signal analysis, Fourier methods, the groundwork for audio processing', projects: [] },

    // Software & product
    { id: 'sad', lane: 'product', term: 4, grade: 16.05, title: 'Systems Analysis & Design', skills: 'Requirements, system modeling',
      projects: [['Chapar system design', repo('chapar-system-design')]] },
    { id: 'db', lane: 'product', term: 5, grade: 13.44, title: 'Databases', skills: 'SQL, data modeling',
      projects: [['Database exercises', repo('software-systems-labs', 'databases')]] },
    { id: 'web', lane: 'product', term: 6, grade: 19.4, title: 'Web Programming', skills: 'HTML, CSS, JavaScript',
      projects: [['Web exercises', repo('software-systems-labs', 'web')]] },
    { id: 'ecom', lane: 'product', term: 6, grade: 19.23, title: 'E-commerce', skills: 'Business models, validation, positioning',
      projects: [['Irangard business case', repo('irangard-business-case')]] },
    { id: 'hci', lane: 'product', term: 7, grade: 20, title: 'Human–Computer Interaction', skills: 'User research, information architecture, interface design',
      projects: [['Tourism UX case study', repo('tourism-ux-case-study')]] },
    { id: 'startup', lane: 'product', term: 7, grade: 19.12, title: 'Startup Development', skills: 'Problem discovery, competitor analysis, MVP feedback',
      projects: [['DiaTech product discovery', repo('diatech-product-case')]] },
    { id: 'pm', lane: 'product', term: 7, grade: 19.5, title: 'IT Project Management', skills: 'Planning, work breakdown, dependencies',
      projects: [['Talent Search project planning', repo('talent-search-project-planning')]] },

    // Engineering foundations
    { id: 'prog', lane: 'found', term: 1, grade: 13.97, title: 'Intro to Programming', skills: 'Procedural programming in C++',
      projects: [['Restaurant management in C++', repo('programming-foundations', 'cpp-restaurant')]] },
    { id: 'adv', lane: 'found', term: 2, grade: 15.79, title: 'Advanced Programming', skills: 'Object-oriented programming in Java',
      projects: [['Java chat server', repo('programming-foundations', 'java-chat-server')], ['JavaFX game source', repo('programming-foundations', 'javafx-game-source')]] },
    { id: 'logic', lane: 'found', term: 3, grade: 13.4, title: 'Digital Logic Design', skills: 'Combinational and sequential circuits',
      projects: [['Proteus circuits', repo('embedded-systems-labs', 'digital-logic')]] },
    { id: 'ds', lane: 'found', term: 3, grade: 15.75, title: 'Data Structures', skills: 'Trees, heaps, complexity',
      projects: [['Heap-based task manager', repo('programming-foundations', 'java-task-manager')]] },
    { id: 'algo', lane: 'found', term: 4, grade: 20, title: 'Design of Algorithms', skills: 'Algorithm design, complexity analysis', projects: [] },
    { id: 'automata', lane: 'found', term: 4, grade: 17.53, title: 'Theory of Languages & Automata', skills: 'Formal languages, automata', projects: [] },
    { id: 'arch', lane: 'found', term: 4, grade: 15.75, title: 'Computer Architecture', skills: 'Processor design', projects: [] },
    { id: 'os', lane: 'found', term: 5, grade: 16.8, title: 'Operating Systems', skills: 'Scheduling, memory, synchronization',
      projects: [['Operating systems exercises', repo('software-systems-labs', 'operating-systems')]] },
    { id: 'net', lane: 'found', term: 5, grade: 17.4, title: 'Computer Networks', skills: 'Protocols, sockets',
      projects: [['FTP client and server', repo('ftp-client-server')], ['Network exercises', repo('software-systems-labs', 'networks')]] },
    { id: 'archlab', lane: 'found', term: 5, grade: 14.2, title: 'Computer Architecture Lab', skills: 'VHDL, digital design',
      projects: [['VHDL exercises', repo('embedded-systems-labs', 'computer-architecture')]] },
    { id: 'mplab', lane: 'found', term: 8, grade: 18, title: 'Micro­processor Lab', skills: 'STM32, hardware interfaces',
      projects: [['STM32 projects', repo('embedded-systems-labs', 'microprocessor')]] },
    { id: 'mp', lane: 'found', term: 9, kind: 'remaining', title: 'Micro­processors', status: 'Remaining', skills: 'Assembly, microprocessor systems', projects: [] },
  ];

  const velocity = g => Math.min(1, Math.max(0, g / 20));

  // Header row
  const th = (text, cls) => { const d = document.createElement('div'); d.className = 'th' + (cls ? ' ' + cls : ''); d.textContent = text; roll.appendChild(d); };
  th('Area', 'first');
  terms.forEach(t => th(t));
  th('');

  const buttons = new Map();
  lanes.forEach((lane, li) => {
    const name = document.createElement('div');
    name.className = 'lane-name';
    name.textContent = lane.name;
    roll.appendChild(name);
    for (let term = 1; term <= 9; term++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (li % 2 ? ' odd' : '');
      courses.filter(c => c.lane === lane.id && c.term === term).forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'note-btn' + (c.kind ? ' ' + c.kind : (lane.id === 'listen' || lane.id === 'signal') ? ' listen' : '');
        if (c.grade != null) b.style.setProperty('--v', velocity(c.grade).toFixed(3));
        b.textContent = c.title;
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', c.title + (c.grade != null ? ', grade ' + c.grade + ' out of 20' : ', ' + c.status));
        b.addEventListener('click', () => select(c.id));
        cell.appendChild(b);
        buttons.set(c.id, b);
      });
      roll.appendChild(cell);
    }
  });
  const dest = document.createElement('div');
  dest.className = 'dest';
  dest.innerHTML = 'AI that listens<small>where the lanes meet</small>';
  roll.appendChild(dest);

  function select(id) {
    const c = courses.find(x => x.id === id);
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === id)));
    const lane = lanes.find(l => l.id === c.lane).name;
    const grade = c.grade != null ? c.grade + ' / 20' : c.status;
    detail.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = '<h3></h3><div class="sub"></div>';
    h.querySelector('h3').textContent = c.title;
    h.querySelector('.sub').textContent = lane + ' · ' + terms[c.term - 1] + (c.official ? ' · listed as ' + c.official : '');
    const g = document.createElement('div');
    g.className = 'grade';
    g.textContent = grade;
    const s = document.createElement('div');
    s.className = 'skills';
    s.textContent = c.skills;
    detail.append(h, g, s);
    if (c.projects.length) {
      const ul = document.createElement('ul');
      c.projects.forEach(([label, href]) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = label;
        li.appendChild(a);
        ul.appendChild(li);
      });
      detail.appendChild(ul);
    }
  }
  select('nlp');

  // On narrow screens, open the roll at the latest semesters, where the lanes meet
  const scroller = roll.parentElement;
  requestAnimationFrame(() => { if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth; });
})();
