// The courses as two roads: building products on one side, AI on the other. They run side by side through the
// degree and meet at the end, where they lead. Each stop is a course; tap one to see what it was. The drawing follows
// the scroll through --draw (0 to 1), set by the story; without it, the roads are simply drawn.
(() => {
  const map = document.getElementById('roads');
  const detail = document.getElementById('detail');
  if (!map) return;

  const GH = 'https://github.com/Moein-Bagheri/';
  const repo = (name, path) => GH + name + (path ? '/tree/main/' + path : '');
  const terms = ["Fall '22", "Spr '23", "Fall '23", "Spr '24", "Fall '24", "Spr '25", "Fall '25", "Spr '26", "Fall '26"];

  // each road in the order its ideas build on each other (not the timetable: some courses came late because of when
  // they were offered)
  const roads = [
    { id: 'product', name: 'Product', courses: [
      { id: 'sad', short: 'Systems Analysis', term: 4, grade: 16.05, title: 'Systems Analysis & Design', skills: 'Requirements, system modeling',
        projects: [['Chapar system design', repo('chapar-system-design')]] },
      { id: 'db', short: 'Databases', term: 5, grade: 13.44, title: 'Databases', skills: 'SQL, data modeling',
        projects: [['Database exercises', repo('software-systems-labs', 'databases')]] },
      { id: 'web', short: 'Web Programming', term: 6, grade: 19.4, title: 'Web Programming', skills: 'HTML, CSS, JavaScript',
        projects: [['Web exercises', repo('software-systems-labs', 'web')]] },
      { id: 'hci', short: 'HCI', term: 7, grade: 20, title: 'Human–Computer Interaction', skills: 'User research, information architecture, interface design',
        projects: [['Tourism UX case study', repo('tourism-ux-case-study')]] },
      { id: 'ecom', short: 'E-commerce', term: 6, grade: 19.23, title: 'E-commerce', skills: 'Business models, validation, positioning',
        projects: [['Irangard business case', repo('irangard-business-case')]] },
      { id: 'pm', short: 'Project Management', term: 7, grade: 19.5, title: 'IT Project Management', skills: 'Planning, work breakdown, dependencies',
        projects: [['Talent Search project planning', repo('talent-search-project-planning')]] },
      { id: 'startup', short: 'Startups', term: 7, grade: 19.12, title: 'Startup Development', skills: 'Problem discovery, competitor analysis, MVP feedback',
        projects: [['DiaTech product discovery', repo('diatech-product-case')]] },
    ] },
    { id: 'ai', name: 'AI', courses: [
      { id: 'linalg', short: 'Linear Algebra', term: 5, grade: 18.87, title: 'Applied Linear Algebra', skills: 'Matrices, decompositions, least squares',
        projects: [['Linear algebra labs', repo('math-and-ml-labs', 'linear-algebra')]] },
      { id: 'signals', short: 'Signals & Systems', term: 8, grade: 20, title: 'Signals & Systems', skills: 'Signal analysis, Fourier methods, the groundwork for audio processing', projects: [] },
      { id: 'ai', short: 'AI', term: 7, grade: 18, title: 'Artificial Intelligence', skills: 'Search, reinforcement learning, logical reasoning',
        projects: [['Classical AI projects', repo('classical-ai-projects')]] },
      { id: 'ml', short: 'Machine Learning', term: 6, grade: 16.75, title: 'Machine Learning', skills: 'Modeling, optimization, evaluation',
        projects: [['Machine learning labs', repo('math-and-ml-labs', 'machine-learning')], ['Neural style transfer', repo('neural-style-transfer')]] },
      { id: 'dl', short: 'Deep Learning', term: 7, grade: 18.5, title: 'Deep Learning', official: 'Special Topics 1', skills: 'Neural networks, sequence models, computer vision',
        projects: [['Deep ECG classification', repo('deep-ecg-lab')], ['Hand gesture recognition', repo('hand-gesture-recognition')], ['Smile detector', repo('smile-detector')]] },
      { id: 'dm', short: 'Data Mining', term: 8, grade: 19.75, title: 'Data Mining', skills: 'Data analysis, retrieval-augmented generation',
        projects: [['Local research assistant', repo('local-research-assistant')], ['Credit limit prediction', repo('credit-limit-prediction')]] },
      { id: 'ir', short: 'Info Retrieval', term: 8, grade: 18.25, title: 'Information Retrieval', skills: 'Indexing, ranking, Persian text processing',
        projects: [['Persian information retrieval', repo('persian-information-retrieval')]] },
      { id: 'iot', short: 'IoT', term: 8, grade: 17.75, title: 'Internet of Things', skills: 'Edge AI, system design',
        projects: [['Edge AI maintenance design', repo('ai-system-design-studies', 'edge-ai-maintenance')]] },
      { id: 'nlp', short: 'Speech & Language', term: 8, grade: 20, title: 'Language & Speech Processing', skills: 'Speech processing, language models, text classification',
        projects: [['Speech emotion recognition', repo('speech-emotion-recognition')], ['N-gram music completion', repo('ngram-music-completion')], ['Text classification with embeddings', repo('text-classification-embeddings')], ['NLP fundamentals', repo('nlp-fundamentals-labs')], ['Low-resource sentiment analysis design', repo('ai-system-design-studies', 'low-resource-sentiment')]] },
    ] },
  ];

  // The drawing: two roads, the stretch where they run as one, a stop on the road for each course, and where it leads
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, parent) => {
    const e = document.createElementNS(NS, tag);
    e.setAttribute('class', cls);
    parent.appendChild(e);
    return e;
  };
  const svg = el('svg', 'roads-svg', map);
  svg.setAttribute('aria-hidden', 'true');
  const paths = roads.map((road) => el('path', 'road road-' + road.id, svg));
  const meet = el('path', 'road road-meet', svg);
  const end = el('circle', 'end', svg);
  end.setAttribute('r', 6);
  const names = roads.map((road) => {
    const n = document.createElement('span');
    n.className = 'road-name road-name-' + road.id;
    n.textContent = road.name;
    map.appendChild(n);
    return n;
  });
  const dest = document.createElement('div');
  dest.className = 'dest';
  dest.innerHTML = 'AI product builder<small>where the roads meet</small>';
  map.appendChild(dest);

  const buttons = new Map();
  roads.forEach((road) => road.courses.forEach((c) => {
    c.road = road;
    c.stop = el('circle', 'stop stop-' + road.id, svg);
    c.stop.setAttribute('r', 4);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip-' + road.id;
    b.textContent = c.short;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', c.title + ', grade ' + c.grade + ' out of 20');
    b.addEventListener('click', () => select(c.id));
    map.appendChild(b);
    c.chip = b;
    buttons.set(c.id, b);
  }));

  // Products above, AI below; both bend in to meet at about three quarters of the way, then run on as one road.
  // Stops spread evenly across the width (so labels keep their distance where a road bends); every other label sits
  // a row further out, so neighbours never collide.
  function layout() {
    const W = map.clientWidth, H = map.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x0 = 96, xm = W * 0.7, xd = W * 0.78, ym = H * 0.5;
    paths.forEach((p, r) => {
      const y = H * (r ? 0.7 : 0.3);
      p.setAttribute('d', `M ${x0} ${y} L ${W * 0.38} ${y} C ${W * 0.55} ${y}, ${W * 0.58} ${ym}, ${xm} ${ym}`);
      names[r].style.left = x0 + 'px';
      names[r].style.top = y + 'px';
    });
    meet.setAttribute('d', `M ${xm} ${ym} L ${xd} ${ym}`);
    end.setAttribute('cx', xd);
    end.setAttribute('cy', ym);
    [...paths, meet].forEach((p) => p.style.setProperty('--len', p.getTotalLength().toFixed(1) + 'px'));
    roads.forEach((road, r) => {
      const path = paths[r], L = path.getTotalLength(), n = road.courses.length;
      // the length along the road at which it reaches x (x only grows along a road)
      const at = (x) => {
        let lo = 0, hi = L;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (path.getPointAtLength(mid).x < x) lo = mid;
          else hi = mid;
        }
        return lo;
      };
      const placed = [];
      road.courses.forEach((c, i) => {
        const len = at(x0 + 40 + (i / (n - 1)) * (xm - x0 - 100)), f = len / L, pt = path.getPointAtLength(len);
        c.stop.setAttribute('cx', pt.x);
        c.stop.setAttribute('cy', pt.y);
        // the nearest row out from the road where this label clears the ones before it
        const w = c.chip.offsetWidth + 8, h = c.chip.offsetHeight + 6;
        let off = 14;
        for (; off < 14 + 28 * 2; off += 28) {
          const y0 = r ? pt.y + off : pt.y - off - h;
          if (!placed.some((q) => pt.x - w / 2 < q.x1 && q.x0 < pt.x + w / 2 && y0 < q.y1 && q.y0 < y0 + h)) break;
        }
        const y0 = r ? pt.y + off : pt.y - off - h;
        placed.push({ x0: pt.x - w / 2, x1: pt.x + w / 2, y0, y1: y0 + h });
        c.chip.style.left = pt.x + 'px';
        c.chip.style.top = (r ? pt.y + off : pt.y - off) + 'px';
        c.chip.style.setProperty('--stem', off - 6 + 'px');
        // the road reaches this stop when the drawing is this far along
        [c.stop, c.chip].forEach((e) => e.style.setProperty('--at', (f * 0.8).toFixed(3)));
      });
    });
    dest.style.left = xd + 18 + 'px';
    dest.style.top = ym + 'px';
  }

  function select(id) {
    const c = roads.flatMap((r) => r.courses).find((x) => x.id === id);
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === id)));
    detail.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = '<h3></h3><div class="sub"></div>';
    h.querySelector('h3').textContent = c.title;
    h.querySelector('.sub').textContent = c.road.name + ' · ' + terms[c.term - 1] + (c.official ? ' · listed as ' + c.official : '');
    const g = document.createElement('div');
    g.className = 'grade';
    g.textContent = c.grade + ' / 20';
    const s = document.createElement('div');
    s.className = 'skills';
    s.textContent = c.skills;
    detail.append(h, g, s);
    if (c.projects.length) {
      const ul = document.createElement('ul');
      c.projects.forEach(([label, href]) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = label;
        a.insertAdjacentHTML('beforeend', '<svg class="gh" aria-hidden="true"><use href="#gh"/></svg>'); // (the mark is defined once in the page)
        li.appendChild(a);
        ul.appendChild(li);
      });
      detail.appendChild(ul);
    }
  }

  layout();
  // labels are measured to keep them apart, so measure again once the fonts have arrived
  if (document.fonts) document.fonts.ready.then(layout);
  select('nlp');
  let raf = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  });
  // On narrow screens the map scrolls sideways; open it where the roads meet
  const scroller = map.parentElement;
  requestAnimationFrame(() => { if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth; });
})();
