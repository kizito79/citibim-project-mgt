// ============================================
// PROFESSIONAL GANTT DASHBOARD SYSTEM v4.1
// PapaParse + Optimized DOM + Spatial Logic
// ============================================

const ROW_HEIGHT = 45;
const DAY = 1000 * 60 * 60 * 24;

// Notification system
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span>${message}</span>
    <button class="notification-close">&times;</button>
  `;
  
  // Style the notification
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '10000',
    maxWidth: '400px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: '0',
    transform: 'translateY(-10px)',
    transition: 'all 0.3s ease'
  });
  
  // Close button
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.color = 'white';
  closeBtn.style.fontSize = '18px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.marginLeft = '10px';
  
  closeBtn.addEventListener('click', () => {
    notification.remove();
  });
  
  // Add to body
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(async () => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  }, 10);
  
  // Auto remove after 5 seconds
  setTimeout(async () => {
    if (notification.parentNode) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-10px)';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    console.warn(`Invalid date string: ${dateStr}`);
    return null;
  }
  return d;
}

function getProjectStart() {
  if (state.tasks.length === 0) return new Date("2022-03-20");

  let earliest = null;
  for (const task of state.tasks) {
    const taskStart = task.start instanceof Date ? task.start : parseDate(task.start);
    if (!taskStart) continue; // Skip invalid dates
    if (earliest === null || taskStart < earliest) {
      earliest = taskStart;
    }
  }

  if (earliest === null) return new Date("2022-03-20");

  const start = new Date(earliest);
  start.setDate(1);
  return start;
}

function getTimelineBounds() {
  if (state.tasks.length === 0) {
    const startDate = new Date("2022-03-20");
    return {
      start: startDate,
      end: addDays(startDate, 120),
      daysTotal: 120,
      buffer: 7
    };
  }

  // Find earliest and latest task dates
  let earliest = null;
  let latest = null;

  state.tasks.forEach(task => {
    const taskStart = task.start instanceof Date ? task.start : new Date(task.start);
    const taskEnd = task.end instanceof Date ? task.end : new Date(task.end);
    
    if (!isNaN(taskStart.getTime())) {
      if (earliest === null || taskStart < earliest) earliest = new Date(taskStart);
    }
    if (!isNaN(taskEnd.getTime())) {
      if (latest === null || taskEnd > latest) latest = new Date(taskEnd);
    }
  });

  // Fallback if no valid dates found
  if (earliest === null) earliest = new Date("2022-03-20");
  if (latest === null) latest = addDays(earliest, 30);

  // Add visual buffers (7 days before, 30 days after)
  const bufferStart = addDays(earliest, -7);
  const bufferEnd = addDays(latest, 30);

  return {
    start: bufferStart,
    end: bufferEnd,
    daysTotal: daysBetween(bufferStart, bufferEnd),
    buffer: 7
  };
}

let PROJECT_START = new Date("2022-03-20");

const DOM = {
  timeline: document.getElementById("timeline"),
  bars: document.getElementById("bars"),
  taskList: document.getElementById("task-list-container"),
  importModal: document.getElementById("import-modal"),
  taskModal: document.getElementById("task-modal"),
  taskFilter: document.getElementById("task-filter"),
  pageTitle: document.querySelector(".page-title"),
  ganttPanel: document.querySelector(".gantt-panel"),
  ganttContainer: document.querySelector(".gantt-container")
};

const SCALE_CONFIG = {
  day: { cellWidth: 70, step: 1, type: "day", format: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), label: "Daily View" },
  week: { cellWidth: 110, step: 7, type: "week", format: (d) => `W${Math.ceil(daysBetween(PROJECT_START, d) / 7 + 1)}`, label: "Weekly View" },
  month: { cellWidth: 160, step: "smart", type: "month", format: (d) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), label: "Monthly View" }
};

let state = {
  scale: "month",
  currentStep: 1,
  selectedTask: null,
  importedData: null,
  columnMapping: {},
  tasks: [],
  isDragging: false,
  isResizing: false,
  scrollOffset: 0,
  timelineStart: 0,
  timelineEnd: 120,
  monthOffsets: [],
  sheetsInterval: null,
  sheetsUrl: null,
  sheetsTabs: [],
  sheetsSelectedTab: null,
  sheetsSelectedGid: null,
  wizardSheetUrl: null,
  wizardSheetTabs: [],
  wizardSelectedTabIndex: null,
  wizardSelectedGid: null,
  projects: [],
  currentProject: null,
  filterProjectId: null,
  map: { instance: null, markersLayer: null },
  cardLocks: {},
  dynamicKPIs: {},
  summaryTitle: 'Project Summary',
  summaryPageSize: 'a4'
};

// ============================================
// PDF EXPORT WEB WORKER MANAGEMENT
// ============================================

const PDFWorkerManager = {
  worker: null,
  isInitialized: false,

  initialize() {
    if (this.isInitialized) return;
    
    try {
      // Check if web workers are supported
      if (typeof(Worker) !== 'undefined') {
        this.worker = new Worker('pdf-worker.js');
        this.isInitialized = true;
        console.log('✓ PDF Worker initialized successfully');
      } else {
        console.warn('Web Workers not supported, PDF export will run on main thread');
      }
    } catch (error) {
      console.warn('Could not initialize PDF Worker:', error.message);
    }
  },

  onProgress(callback) {
    if (this.worker) {
      this.worker.onmessage = (event) => {
        const { action, status, percent, error } = event.data;
        
        if (action === 'progress') {
          callback({ status, percent, type: 'progress' });
        } else if (action === 'error') {
          callback({ status: error, type: 'error' });
        } else if (action === 'ready') {
          callback({ status: 'Ready to generate PDF', type: 'ready' });
        }
      };
    }
  },

  sendMessage(action, data) {
    if (this.worker) {
      this.worker.postMessage({ action, data });
    }
  },

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
};

function daysBetween(d1, d2) { return Math.floor((d2 - d1) / DAY); } // Use floor instead of round to avoid off-by-one errors
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; } // NOTE: Consider creating immutable version to prevent accidental mutations
function getDaysInMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); }
function getNextMonthStart(date) { const nextMonth = new Date(date); nextMonth.setMonth(nextMonth.getMonth() + 1); nextMonth.setDate(1); return nextMonth; }

function calculateTaskRows() {
  if (state.tasks.length === 0) return;
  
  const sortedTasks = [...state.tasks].sort((a, b) => {
    const dateA = a.start instanceof Date ? a.start : new Date(a.start);
    const dateB = b.start instanceof Date ? b.start : new Date(b.start);
    return dateA - dateB;
  });

  const occupiedRows = {};
  sortedTasks.forEach(task => {
    const taskStart = task.start instanceof Date ? task.start : new Date(task.start);
    const taskEnd = task.end instanceof Date ? task.end : new Date(task.end);
    let assignedRow = 0;

    for (let row = 0; row <= sortedTasks.length; row++) {
      let conflict = false;
      if (occupiedRows[row]) {
        for (const occupant of occupiedRows[row]) {
          const occupantStart = occupant.start instanceof Date ? occupant.start : new Date(occupant.start);
          const occupantEnd = occupant.end instanceof Date ? occupant.end : new Date(occupant.end);
          
          if ((taskStart >= occupantStart && taskStart < occupantEnd) ||
              (taskEnd > occupantStart && taskEnd <= occupantEnd) ||
              (taskStart <= occupantStart && taskEnd >= occupantEnd)) {
            conflict = true;
            break;
          }
        }
      }

      if (!conflict) {
        assignedRow = row;
        break;
      }
    }

    task.row = assignedRow;
    if (!occupiedRows[assignedRow]) occupiedRows[assignedRow] = [];
    occupiedRows[assignedRow].push(task);
  });
}

function calculateMonthOffsets(startDate, numMonths) {
  const offsets = [{ date: new Date(startDate), offset: 0 }];
  let currentDate = new Date(startDate);
  let totalDays = 0;
  
  // Ensure we start at the beginning of the month for consistency
  if (currentDate.getDate() !== 1) {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }
  
  for (let i = 0; i < numMonths; i++) {
    const daysInCurrentMonth = getDaysInMonth(currentDate);
    totalDays += daysInCurrentMonth;
    currentDate = getNextMonthStart(currentDate);
    offsets.push({ date: new Date(currentDate), offset: totalDays });
  }
  return offsets;
}

function formatDate(date) { if (!(date instanceof Date)) date = new Date(date); return date.toISOString().split('T')[0]; }
function formatDateDisplay(date) { return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  // Use DOM API to properly escape HTML
  const div = document.createElement('div');
  div.textContent = str.trim().substring(0, 500);
  return div.innerHTML;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateURL(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
function generateTaskId() { 
  if (state.tasks.length === 0) return 1;
  const ids = state.tasks.map(t => parseInt(t.id) || 0).filter(id => !isNaN(id) && id > 0);
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}
function generateProjectId() { return 'project_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }
function generateSheetId() { return 'sheet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

function validateTask(task) {
  // Name validation
  if (!task.name?.trim()) return { valid: false, error: "Task name is required" };
  if (task.name.trim().length > 200) return { valid: false, error: "Task name is too long (max 200 characters)" };
  if (task.name.trim().length < 2) return { valid: false, error: "Task name is too short (min 2 characters)" };
  
  // Start date validation
  if (!(task.start instanceof Date) || isNaN(task.start)) {
    return { valid: false, error: "Invalid start date" };
  }
  
  // End date validation
  if (!(task.end instanceof Date) || isNaN(task.end)) {
    return { valid: false, error: "Invalid end date" };
  }
  
  // Date range validation
  if (task.end < task.start) {
    return { valid: false, error: "End date must be after start date" };
  }
  
  // Duration validation (reasonable limits)
  const duration = daysBetween(task.start, task.end);
  if (duration < 0) {
    return { valid: false, error: "Invalid date range" };
  }
  if (duration > 3650) { // ~10 years
    return { valid: false, error: "Task duration is unreasonably long (max ~10 years)" };
  }
  
  // Progress validation
  if (typeof task.progress !== 'number' || task.progress < 0 || task.progress > 100) {
    return { valid: false, error: "Progress must be between 0 and 100" };
  }
  
  // Assigned to validation
  if (task.assignedTo && task.assignedTo.length > 100) {
    return { valid: false, error: "Assignee name is too long" };
  }
  
  // Dependencies validation
  if (task.dependencies && !Array.isArray(task.dependencies)) {
    return { valid: false, error: "Invalid dependencies format" };
  }
  
  // Check for circular dependencies
  if (task.dependencies && task.dependencies.includes(task.id)) {
    return { valid: false, error: "Task cannot depend on itself" };
  }
  
  // Check for circular dependency chains
  if (task.dependencies && task.dependencies.length > 0) {
    const visited = new Set();
    const isCircular = (depId) => {
      if (visited.has(depId)) return true;
      visited.add(depId);
      const depTask = state.tasks.find(t => t.id === depId);
      if (depTask && depTask.dependencies) {
        for (const chainDepId of depTask.dependencies) {
          if (isCircular(chainDepId)) return true;
        }
      }
      return false;
    };
    
    for (const depId of task.dependencies) {
      visited.clear();
      if (isCircular(depId)) {
        return { valid: false, error: "Circular dependency detected" };
      }
    }
  }
  
  return { valid: true };
}

let isSaving = false;

async function saveTasks() {
  if (isSaving) {
    console.log('[CLIENT saveTasks] Save already in progress, skipping');
    return false;
  }

  isSaving = true;
  try {
    if (!state.tasks || !Array.isArray(state.tasks)) {
      throw new Error('Invalid tasks data structure');
    }

    const serialized = state.tasks.map(t => {
      if (!t.id || !t.name || !t.start || !t.end) {
        throw new Error(`Invalid task: missing required fields (ID: ${t.id}, Name: ${t.name})`);
      }
      return { ...t, start: formatDate(t.start), end: formatDate(t.end) };
    });

    const payload = {
      tasks: serialized,
      projects: state.projects || [],
      sheetsSettings: { url: state.sheetsUrl, isPolling: !!state.sheetsInterval },
      cardLocks: state.cardLocks || {},
      dynamicKPIs: state.dynamicKPIs || {},
      summaryTitle: state.summaryTitle || 'Project Summary'
    };

    console.log('[CLIENT saveTasks] Payload: tasks=' + payload.tasks.length + ', projects=' + payload.projects.length);

    const saveLocally = () => {
      localStorage.setItem("gantt-tasks-v3", JSON.stringify(serialized));
      localStorage.setItem("gantt-projects", JSON.stringify(state.projects || []));
      localStorage.setItem("gantt-sheets-settings", JSON.stringify(payload.sheetsSettings));
      localStorage.setItem("gantt-card-locks", JSON.stringify(state.cardLocks || {}));
      localStorage.setItem("gantt-dynamic-kpis", JSON.stringify(state.dynamicKPIs || {}));
      localStorage.setItem("gantt-summary-title", JSON.stringify(state.summaryTitle || 'Project Summary'));
      console.log('[CLIENT saveTasks] Saved to localStorage');
    };

    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Backend save failed (${response.status})`);
      }

      const result = await response.json();
      console.log('[CLIENT saveTasks] Backend response:', result);
      saveLocally();
      showNotification("✓ Data saved to backend", "success");
      return true;
    } catch (backendError) {
      console.warn('[CLIENT saveTasks] Backend save failed, falling back to localStorage:', backendError);
      saveLocally();
      showNotification("⚠️ Backend unavailable — saved locally instead", "warning");
      return true;
    }
  } catch (error) {
    console.error('Save error:', error);
    showNotification(`✗ Save failed: ${error.message}`, "error");
    return false;
  } finally {
    isSaving = false;
  }
}

async function loadTasks() {
  try {
    const response = await fetch('/api/state');
    if (response.ok) {
      const savedState = await response.json();
      state.tasks = Array.isArray(savedState.tasks)
        ? savedState.tasks.map(t => ({ ...t, start: new Date(t.start), end: new Date(t.end), dependencies: t.dependencies || [] }))
        : [];
      state.projects = Array.isArray(savedState.projects) ? savedState.projects : [];
      const settings = savedState.sheetsSettings || {};
      state.sheetsUrl = settings.url || null;
      if (settings.url && settings.isPolling) {
        // Use Promise-based approach instead of setTimeout
        Promise.resolve().then(() => startGoogleSheetsPolling(settings.url));
      }
      state.cardLocks = savedState.cardLocks || {};
      state.dynamicKPIs = savedState.dynamicKPIs || {};
      state.summaryTitle = savedState.summaryTitle || 'Project Summary';
      
      // Clean orphaned data
      state.tasks = state.tasks.filter(task => !task.projectId || state.projects.some(p => p.id === task.projectId));
      state.tasks.forEach(task => {
        task.dependencies = task.dependencies.filter(dep => state.tasks.some(t => t.id === dep));
      });
      
      return true;
    }

    throw new Error(`Backend load failed (${response.status})`);
  } catch (error) {
    console.warn('Backend load failed, falling back to localStorage:', error);

    try {
      const savedTasks = localStorage.getItem("gantt-tasks-v3");
      if (savedTasks) {
        state.tasks = JSON.parse(savedTasks).map(t => {
          try {
            return {
              ...t,
              start: new Date(t.start),
              end: new Date(t.end),
              dependencies: t.dependencies || []
            };
          } catch (err) {
            console.error('Error parsing task:', t, err);
            return null;
          }
        }).filter(t => t !== null);
      }

      const savedProjects = localStorage.getItem("gantt-projects");
      if (savedProjects) {
        state.projects = JSON.parse(savedProjects);
      }
      
      // Clean orphaned data
      state.tasks = state.tasks.filter(task => !task.projectId || state.projects.some(p => p.id === task.projectId));
      state.tasks.forEach(task => {
        task.dependencies = task.dependencies.filter(dep => state.tasks.some(t => t.id === dep));
      });

      const sheetsSettings = localStorage.getItem("gantt-sheets-settings");
      if (sheetsSettings) {
        const settings = JSON.parse(sheetsSettings);
        state.sheetsUrl = settings.url;
        if (settings.url && settings.isPolling) {
          // Use Promise-based approach instead of setTimeout to avoid race conditions
          Promise.resolve().then(() => startGoogleSheetsPolling(settings.url));
        }
      }

      const cardLocks = localStorage.getItem("gantt-card-locks");
      if (cardLocks) {
        state.cardLocks = JSON.parse(cardLocks);
      }

      const dynamicKPIs = localStorage.getItem("gantt-dynamic-kpis");
      if (dynamicKPIs) {
        state.dynamicKPIs = JSON.parse(dynamicKPIs);
      }

      const summaryTitle = localStorage.getItem("gantt-summary-title");
      if (summaryTitle) {
        state.summaryTitle = JSON.parse(summaryTitle);
      }
    } catch (storageError) {
      console.error('Load fallback error:', storageError);
      showNotification(`✗ Load failed: ${storageError.message}`, "error");
      return false;
    }

    return true;
  }
}


function renderTimeline() {
  try {
    DOM.timeline.innerHTML = "";
    if (state.scale === "month") renderSmartMonthTimeline();
    else renderStandardTimeline(SCALE_CONFIG[state.scale]);
  } catch (error) {
    console.error('Timeline render error:', error);
    showNotification(`✗ Failed to render timeline: ${error.message}`, 'error');
    DOM.timeline.innerHTML = '<div class="error-message">Error rendering timeline</div>';
  }
}

function setGanttScale(scale) {
  if (!SCALE_CONFIG[scale]) return;
  state.scale = scale;
  
  // Calculate dynamic timeline bounds
  const bounds = getTimelineBounds();
  state.timelineStart = 0;
  state.timelineEnd = bounds.daysTotal || 120;
  
  updateGanttScaleButtons();
  renderTimeline();
  render();
}

function updateGanttScaleButtons() {
  document.querySelectorAll('.btn-scale').forEach(btn => {
    btn.classList.toggle('active', btn.id === `${state.scale}-btn`);
  });
}

function renderSmartMonthTimeline() {
  const config = SCALE_CONFIG.month;
  const bounds = getTimelineBounds();
  
  // Calculate months from start to end date
  let monthsNeeded = 0;
  let current = new Date(bounds.start);
  while (current < bounds.end) {
    monthsNeeded++;
    current.setMonth(current.getMonth() + 1);
  }
  
  state.monthOffsets = calculateMonthOffsets(bounds.start, Math.max(monthsNeeded + 2, 36));
  const gridCols = state.monthOffsets.slice(0, -1).map(m => `${getDaysInMonth(m.date) * (config.cellWidth / 30)}px`).join(' ');
  DOM.timeline.style.gridTemplateColumns = gridCols;
  
  state.monthOffsets.slice(0, -1).forEach(m => {
    const div = document.createElement("div");
    div.className = "timeline-cell month-header";
    div.textContent = config.format(m.date);
    div.style.gridColumn = `span ${Math.round(getDaysInMonth(m.date) * (config.cellWidth / 30))}`;
    DOM.timeline.appendChild(div);
  });
}

function renderStandardTimeline(config) {
  const displayCells = Math.min(120, state.timelineEnd - state.timelineStart);
  const bounds = getTimelineBounds();
  const timelineStart = bounds.start;
  
  DOM.timeline.style.gridTemplateColumns = `repeat(${displayCells}, ${config.cellWidth}px)`;
  for (let i = state.timelineStart; i < state.timelineStart + displayCells; i++) {
    const d = addDays(timelineStart, config.step === 1 ? i : i * config.step);
    const div = document.createElement("div");
    div.className = "timeline-cell";
    div.textContent = config.format(d);
    DOM.timeline.appendChild(div);
  }
}

function setupInfiniteScrollTimeline() {
  DOM.bars.addEventListener("scroll", () => {
    const { scrollLeft, clientWidth, scrollWidth } = DOM.bars;
    if (scrollLeft + clientWidth > scrollWidth - 500) { state.timelineEnd += 30; renderTimeline(); render(); }
    if (scrollLeft < 500 && state.timelineStart > 0) { state.timelineStart = Math.max(0, state.timelineStart - 30); renderTimeline(); render(); }
  });
}

function renderTaskList() {
  DOM.taskList.innerHTML = "";
  const filter = DOM.taskFilter?.value.toLowerCase() || "";
  
  if (state.tasks.length === 0) {
    DOM.taskList.innerHTML = '<div class="empty-state">No tasks yet. Create one to get started!</div>';
    return;
  }

  state.tasks.forEach(task => {
    if (filter && !task.name.toLowerCase().includes(filter)) return;
    const taskEl = document.createElement("div");
    taskEl.className = `task-item ${state.selectedTask?.id === task.id ? "selected" : ""}`;
    const progress = Number(task.progress) || 0;
    const progressColor = progress > 70 ? "#4ade80" : progress > 30 ? "#facc15" : "#ef4444";

    // Build DOM safely without innerHTML
    const contentDiv = document.createElement("div");
    contentDiv.className = "task-item-content";

    const headerDiv = document.createElement("div");
    headerDiv.className = "task-item-header";

    const nameH4 = document.createElement("h4");
    nameH4.className = "task-name";
    nameH4.textContent = task.name;
    headerDiv.appendChild(nameH4);

    const progressSpan = document.createElement("span");
    progressSpan.className = "task-progress-text";
    progressSpan.textContent = `${progress}%`;
    headerDiv.appendChild(progressSpan);

    contentDiv.appendChild(headerDiv);

    const progressBarDiv = document.createElement("div");
    progressBarDiv.className = "task-progress-bar";
    const progressFillDiv = document.createElement("div");
    progressFillDiv.className = "progress-bar-fill";
    progressFillDiv.style.cssText = `width: ${progress}%; background: ${progressColor};`;
    progressBarDiv.appendChild(progressFillDiv);
    contentDiv.appendChild(progressBarDiv);

    const metaDiv = document.createElement("div");
    metaDiv.className = "task-meta";

    const dateSpan = document.createElement("span");
    dateSpan.className = "task-date";
    dateSpan.textContent = `📅 ${formatDateDisplay(task.start)} → ${formatDateDisplay(task.end)}`;
    metaDiv.appendChild(dateSpan);

    const assignedSpan = document.createElement("span");
    assignedSpan.className = "task-assigned";
    assignedSpan.textContent = `👤 ${task.assignedTo || "Unassigned"}`;
    metaDiv.appendChild(assignedSpan);

    contentDiv.appendChild(metaDiv);
    taskEl.appendChild(contentDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "task-btn-edit";
    editBtn.textContent = "✏️";
    editBtn.setAttribute("aria-label", "Edit task");
    actionsDiv.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "task-btn-delete";
    deleteBtn.textContent = "🗑️";
    deleteBtn.setAttribute("aria-label", "Delete task");
    actionsDiv.appendChild(deleteBtn);

    taskEl.appendChild(actionsDiv);

    taskEl.addEventListener("click", (e) => { if (!e.target.closest(".task-actions")) selectTask(task); });
    editBtn.addEventListener("click", () => editTask(task));
    deleteBtn.addEventListener("click", () => deleteTask(task.id));
    DOM.taskList.appendChild(taskEl);
  });
}

function getDynamicKPIData(dataSource, calculation, column, filter) {
  const filteredTasks = getFilteredTasks();
  let filtered = filteredTasks;
  
  // Apply filter
  if (filter === 'completed') {
    filtered = filtered.filter(t => (t.progress || 0) === 100);
  } else if (filter === 'active') {
    filtered = filtered.filter(t => (t.progress || 0) > 0 && (t.progress || 0) < 100);
  } else if (filter === 'overdue') {
    const today = new Date();
    filtered = filtered.filter(t => t.end < today && (t.progress || 0) < 100);
  }
  
  if (filtered.length === 0) return { value: 0, label: 'No data' };
  
  // Apply calculation
  switch (calculation) {
    case 'count':
      return { value: filtered.length, label: 'items' };
    case 'sum':
      const sum = filtered.reduce((acc, t) => {
        const val = parseFloat(t[column] || 0);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      return { value: sum.toFixed(2), label: 'total' };
    case 'average':
      const avg = filtered.reduce((acc, t) => {
        const val = parseFloat(t[column] || 0);
        return acc + (isNaN(val) ? 0 : val);
      }, 0) / filtered.length;
      return { value: avg.toFixed(2), label: 'average' };
    case 'max':
      const max = Math.max(...filtered.map(t => parseFloat(t[column] || 0)).filter(v => !isNaN(v)));
      return { value: max, label: 'maximum' };
    case 'min':
      const min = Math.min(...filtered.map(t => parseFloat(t[column] || 0)).filter(v => !isNaN(v)));
      return { value: min, label: 'minimum' };
    case 'percentage':
      const total = filteredTasks.length;
      const percentage = (filtered.length / total * 100).toFixed(1);
      return { value: percentage + '%', label: 'percentage' };
    default:
      return { value: 0, label: 'N/A' };
  }
}

function render() {
  const config = SCALE_CONFIG[state.scale];
  const bounds = getTimelineBounds();

  // Draw dependency lines first (behind task bars)
  renderDependencyLines();

  // Use DocumentFragment to batch DOM operations and reduce reflows
  const fragment = document.createDocumentFragment();

  state.tasks.forEach(task => {
    const progress = Number(task.progress) || 0;
    const snap = state.scale === "month" ? calculateMonthPosition(task.start, task.end) :
      { startPos: daysBetween(bounds.start, task.start) * config.cellWidth, width: Math.max(daysBetween(task.start, task.end) * config.cellWidth, 40) };

    const bar = document.createElement("div");
    bar.className = `bar ${task.class} ${state.selectedTask?.id === task.id ? "selected" : ""}`;
    bar.dataset.taskId = task.id;

    // Batch all style assignments to reduce reflows
    bar.style.cssText = `
      top: ${task.row * ROW_HEIGHT}px;
      left: ${snap.startPos}px;
      width: ${snap.width}px;
      height: ${ROW_HEIGHT - 8}px;
    `;

    // Build bar content safely without innerHTML
    const barContent = document.createElement("div");
    barContent.className = "bar-content";

    const barLabel = document.createElement("span");
    barLabel.className = "bar-label";
    barLabel.textContent = task.name;
    barContent.appendChild(barLabel);

    const barProgress = document.createElement("div");
    barProgress.className = "bar-progress";
    const progressIndicator = document.createElement("div");
    progressIndicator.className = "progress-indicator";
    progressIndicator.style.width = `${progress}%`;
    barProgress.appendChild(progressIndicator);
    barContent.appendChild(barProgress);

    bar.appendChild(barContent);

    const leftHandle = document.createElement("div");
    leftHandle.className = "resize-handle left";
    bar.appendChild(leftHandle);

    const rightHandle = document.createElement("div");
    rightHandle.className = "resize-handle right";
    bar.appendChild(rightHandle);

    bar.addEventListener("click", (e) => { if (!e.target.closest(".resize-handle")) selectTask(task); });
    addDragHandler(bar, task);
    addResizeHandler(bar, task);
    fragment.appendChild(bar);
  });

  // Clear and append in one operation
  DOM.bars.innerHTML = "";
  DOM.bars.appendChild(fragment);
}

function renderDependencyLines() {
  // Create an SVG overlay for dependency lines
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '1';
  
  const config = SCALE_CONFIG[state.scale];
  
  state.tasks.forEach(task => {
    if (!task.dependencies || task.dependencies.length === 0) return;
    
    task.dependencies.forEach(depId => {
      const depTask = state.tasks.find(t => t.id === depId);
      if (!depTask) return;
      
      // Get positions
      const depSnap = state.scale === "month" 
        ? calculateMonthPosition(depTask.start, depTask.end)
        : { startPos: daysBetween(PROJECT_START, depTask.start) * config.cellWidth, width: daysBetween(depTask.start, depTask.end) * config.cellWidth };
      
      const depEndX = depSnap.startPos + depSnap.width;
      const depY = depTask.row * ROW_HEIGHT + ROW_HEIGHT / 2;
      
      const taskSnap = state.scale === "month"
        ? calculateMonthPosition(task.start, task.end)
        : { startPos: daysBetween(PROJECT_START, task.start) * config.cellWidth, width: daysBetween(task.start, task.end) * config.cellWidth };
      
      const taskStartX = taskSnap.startPos;
      const taskY = task.row * ROW_HEIGHT + ROW_HEIGHT / 2;
      
      // Draw line from depTask end to task start
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (depEndX + taskStartX) / 2;
      line.setAttribute('d', `M ${depEndX} ${depY} Q ${midX} ${depY} ${midX} ${(depY + taskY) / 2} Q ${midX} ${taskY} ${taskStartX} ${taskY}`);
      line.setAttribute('stroke', 'rgba(56, 189, 248, 0.4)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke-dasharray', '5,5');
      svg.appendChild(line);
      
      // Draw arrowhead
      const arrowSize = 8;
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const angle = Math.atan2(0, 1);
      arrow.setAttribute('points', `${taskStartX},${taskY} ${taskStartX - arrowSize},${taskY - arrowSize/2} ${taskStartX - arrowSize},${taskY + arrowSize/2}`);
      arrow.setAttribute('fill', 'rgba(56, 189, 248, 0.6)');
      svg.appendChild(arrow);
    });
  });
  
  DOM.bars.insertBefore(svg, DOM.bars.firstChild);
}

function calculateMonthPosition(startDate, endDate) {
  const config = SCALE_CONFIG.month;
  let startPos = 0;
  let endPos = 0;
  
  // Find start position with proper month/day calculation
  for (let i = 0; i < state.monthOffsets.length - 1; i++) {
    const offset = state.monthOffsets[i];
    const nextOffset = state.monthOffsets[i + 1];
    
    if (startDate >= offset.date && startDate < nextOffset.date) {
      const daysInMonth = getDaysInMonth(offset.date);
      const dayOfMonth = Math.max(1, startDate.getDate());
      startPos = (offset.offset + (dayOfMonth - 1)) * (config.cellWidth / daysInMonth);
      break;
    }
  }
  
  // Find end position with proper month/day calculation
  for (let i = 0; i < state.monthOffsets.length - 1; i++) {
    const offset = state.monthOffsets[i];
    const nextOffset = state.monthOffsets[i + 1];
    
    if (endDate > offset.date && endDate <= nextOffset.date) {
      const daysInMonth = getDaysInMonth(offset.date);
      const dayOfMonth = Math.min(endDate.getDate(), daysInMonth);
      endPos = (offset.offset + dayOfMonth) * (config.cellWidth / daysInMonth);
      break;
    } else if (endDate > nextOffset.date && i === state.monthOffsets.length - 2) {
      // Handle case where end date is beyond calculated range
      const daysInMonth = getDaysInMonth(offset.date);
      endPos = (offset.offset + daysInMonth) * (config.cellWidth / daysInMonth);
    }
  }
  
  return { 
    startPos: Math.max(0, startPos), 
    width: Math.max(40, endPos - startPos) 
  };
}

function selectTask(task) { state.selectedTask = task; render(); renderTaskList(); }
function deselectTask() { state.selectedTask = null; render(); renderTaskList(); }

function addDragHandler(bar, task) {
  let offsetX, offsetY;
  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".resize-handle")) return;
    state.isDragging = true;
    bar.classList.add("dragging");
    const containerRect = DOM.bars.getBoundingClientRect();
    offsetX = e.clientX - bar.getBoundingClientRect().left;
    offsetY = e.clientY - bar.getBoundingClientRect().top;

    function handleDragMove(e) {
      let x = Math.max(0, Math.min(e.clientX - containerRect.left - offsetX, DOM.bars.clientWidth - bar.offsetWidth));
      let y = Math.max(0, Math.min(e.clientY - containerRect.top - offsetY, DOM.bars.clientHeight - bar.offsetHeight));
      bar.style.left = `${x}px`; bar.style.top = `${y}px`;
    }

    function handleDragEnd() {
      state.isDragging = false;
      bar.classList.remove("dragging");
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);

      const config = SCALE_CONFIG[state.scale];
      task.start = state.scale === "month" 
        ? addDays(PROJECT_START, Math.round(bar.offsetLeft / (config.cellWidth / 30)))
        : addDays(PROJECT_START, Math.round(bar.offsetLeft / config.cellWidth));
      task.end = addDays(task.start, daysBetween(task.start, task.end));
      task.row = Math.max(0, Math.round(bar.offsetTop / ROW_HEIGHT));

      const snap = state.scale === "month" ? calculateMonthPosition(task.start, task.end) : 
        { startPos: daysBetween(PROJECT_START, task.start) * config.cellWidth, width: Math.max(daysBetween(task.start, task.end) * config.cellWidth, 40) };
      
      bar.style.left = `${snap.startPos}px`;
      bar.style.top = `${task.row * ROW_HEIGHT}px`;
      
      saveTasks(); renderTaskList();
    }
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  });
}

function addResizeHandler(bar, task) {
  [bar.querySelector(".left"), bar.querySelector(".right")].forEach(handle => {
    if (!handle) return;
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      state.isResizing = true;
      const isLeft = handle.classList.contains("left");
      const startX = e.clientX, startLeft = bar.offsetLeft, startWidth = bar.offsetWidth;

      function handleResizeMove(e) {
        const dx = e.clientX - startX;
        if (isLeft) {
          const newLeft = Math.max(0, startLeft + dx);
          const newWidth = startWidth - (newLeft - startLeft);
          if (newWidth > 40) { bar.style.left = `${newLeft}px`; bar.style.width = `${newWidth}px`; }
        } else bar.style.width = `${Math.max(40, startWidth + dx)}px`;
      }

      function handleResizeEnd() {
        state.isResizing = false;
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);

        const config = SCALE_CONFIG[state.scale];
        if (state.scale === "month") {
          task.start = addDays(PROJECT_START, Math.round(bar.offsetLeft / (config.cellWidth / 30)));
          task.end = addDays(PROJECT_START, Math.round((bar.offsetLeft + bar.offsetWidth) / (config.cellWidth / 30)));
        } else {
          task.start = addDays(PROJECT_START, Math.round(bar.offsetLeft / config.cellWidth));
          task.end = addDays(PROJECT_START, Math.round((bar.offsetLeft + bar.offsetWidth) / config.cellWidth));
        }

        const snap = state.scale === "month" ? calculateMonthPosition(task.start, task.end) : 
          { startPos: daysBetween(PROJECT_START, task.start) * config.cellWidth, width: Math.max(daysBetween(task.start, task.end) * config.cellWidth, 40) };
        bar.style.left = `${snap.startPos}px`; bar.style.width = `${snap.width}px`;
        
        saveTasks(); renderTaskList();
      }
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    });
  });
}

function prepareImportData(csvText, source = 'CSV', sheetName = 'Data', projectName = null) {
  if (typeof Papa === 'undefined') { showNotification("PapaParse missing. Include CDN in HTML.", "error"); return; }

  const results = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true, transformHeader: h => h?.trim() });
  const headers = results.meta.fields || [];
  const rows = results.data || [];

  if (!headers.length || !rows.length) { showNotification("No valid CSV data.", "error"); return; }

  state.importedData = { source, headers, rows, sheetName, projectName };
  state.columnMapping = aiMapColumns(headers);
  renderPreview();
  goToStep(2);
}

function isGoogleSheetsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /docs\.google\.com\/spreadsheets\/.+/.test(url);
}

async function loadGoogleSheetImport(url) {
  if (!isGoogleSheetsUrl(url)) {
    showNotification('Enter a valid Google Sheets URL.', 'error');
    return;
  }

  resetGoogleSheetWizardState();
  const trimmedUrl = url.trim();
  state.wizardSheetUrl = trimmedUrl;

  try {
    showLoadingState('Loading Google Sheets information...');
    const info = extractGoogleSheetInfo(trimmedUrl);

    if (info.hasCsvExport || info.isPublishedCsv) {
      renderWizardSheetMessage('Published CSV detected. Tab selection is unavailable with published export URLs. Use the original Google Sheets editor URL to preview specific tabs.', 'warning');
      const { results } = await fetchGoogleSheetCsv(trimmedUrl, info.gid, null);
      prepareImportData(results.csvText, 'Google Sheets', info.publishedId ? `Published CSV` : 'Sheet Data', `Google Sheets Project - ${info.publishedId ? 'Published Data' : 'Imported Sheet'}`);
      return;
    }

    let tabs = [];
    try {
      tabs = await getGoogleSheetTabs(trimmedUrl);
    } catch (error) {
      renderWizardSheetMessage('Unable to enumerate sheet tabs. If you are using a published CSV URL, tab selection is unavailable. Showing the first available worksheet preview.', 'warning');
    }

    if (tabs && tabs.length > 0) {
      state.wizardSheetTabs = tabs;
      state.wizardSelectedTabIndex = 0;
      renderWizardSheetTabs(tabs);
      await selectWizardSheetTab(0);
      return;
    }

    renderWizardSheetMessage('No worksheet tabs could be enumerated. Loading the first sheet for preview.', 'warning');
    const { results } = await fetchGoogleSheetCsv(trimmedUrl, null, null);
    prepareImportData(results.csvText, 'Google Sheets', 'Sheet Data', `Google Sheets Project - Imported Sheet`);
  } catch (error) {
    showNotification(`✗ ${error.message}`, 'error');
  } finally {
    hideLoadingState();
  }
}

function resetGoogleSheetWizardState() {
  state.wizardSheetUrl = null;
  state.wizardSheetTabs = [];
  state.wizardSelectedTabIndex = null;
  state.wizardSelectedGid = null;
  state.importedData = null;
  state.columnMapping = {};
  const sheetTabsPanel = document.getElementById('wizard-sheet-tabs-panel');
  if (sheetTabsPanel) sheetTabsPanel.classList.add('hidden');
  const sheetTabsList = document.getElementById('wizard-sheet-tabs-list');
  if (sheetTabsList) sheetTabsList.innerHTML = '';
  const sheetWizardMessage = document.getElementById('wizard-sheet-message');
  if (sheetWizardMessage) sheetWizardMessage.textContent = '';
  const previewTable = document.getElementById('preview-table');
  if (previewTable) previewTable.innerHTML = '';
}

function renderWizardSheetTabs(tabs) {
  const list = document.getElementById('wizard-sheet-tabs-list');
  if (!list || !tabs || tabs.length === 0) return;

  const isPublishedFallback = tabs && tabs.length === 1 && tabs[0] && tabs[0].published;
  if (isPublishedFallback) {
    renderWizardSheetMessage('Published CSV preview is available, but tab selection is unavailable with this URL. Use the original Google Sheets editor URL for tab selection.', 'warning');
  }

  list.innerHTML = tabs.map((tab, idx) => `
    <label class="sheet-tab-option">
      <input type="radio" name="wizard-sheet-tab" value="${idx}" ${idx === 0 ? 'checked' : ''} ${isPublishedFallback ? 'disabled' : ''} />
      <span>${sanitizeInput(tab?.name || 'Sheet')}</span>
      <small>${tab?.published ? 'Published CSV' : tab?.gid ? `gid=${tab.gid}` : 'no gid available'}</small>
    </label>
  `).join('');
  document.getElementById('wizard-sheet-tabs-panel')?.classList.remove('hidden');

  document.querySelectorAll('input[name="wizard-sheet-tab"]').forEach(input => {
    input.addEventListener('change', async (event) => {
      const index = parseInt(event.target.value, 10);
      await selectWizardSheetTab(index);
    });
  });
}

function renderWizardSheetMessage(message, type = 'info') {
  const msg = document.getElementById('wizard-sheet-message');
  if (!msg) return;
  msg.textContent = message;
  msg.className = `sheet-wizard-message ${type}`;
}

async function selectWizardSheetTab(index) {
  const tab = state.wizardSheetTabs && state.wizardSheetTabs[index];
  if (!tab || !state.wizardSheetUrl) return;
  state.wizardSelectedTabIndex = index;
  state.wizardSelectedGid = tab.gid || null;
  try {
    showLoadingState('Loading selected worksheet preview...');
    const { results } = await fetchGoogleSheetCsv(state.wizardSheetUrl, tab.gid, tab.name);
    prepareImportData(results.csvText, 'Google Sheets', tab.name, `Google Sheets Project - ${tab.name}`);
    goToStep(2);
  } catch (error) {
    showNotification(`✗ ${error.message}`, 'error');
  } finally {
    hideLoadingState();
  }
}


function aiMapColumns(headers) {
  const mapping = {};
  const synonyms = {
    name: ['task', 'title', 'name', 'description', 'subject', 'item'],
    start: ['start', 'from', 'begin', 'date', 'start date'],
    end: ['end', 'to', 'finish', 'due', 'completion', 'end date'],
    progress: ['progress', '%', 'completion', 'status'],
    assignedTo: ['assigned', 'owner', 'responsible', 'person', 'team', 'user'],
    dependencies: ['dependencies', 'predecessors', 'depends', 'predecessor', 'parent task', 'predecessor id'],
    lat: ['lat', 'latitude'],
    lng: ['lng', 'lon', 'longitude']
  };

  Object.entries(synonyms).forEach(([field, syns]) => {
    const match = headers.find(h => syns.some(syn => String(h).toLowerCase().includes(syn.toLowerCase())));
    if (match) mapping[field] = { column: match, confidence: 95 };
  });
  return mapping;
}

function handleFileUpload(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) { showNotification("Only CSV files supported.", "error"); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const fileName = file.name.replace(/\.csv$/i, '');
    prepareImportData(e.target.result, 'Local CSV', fileName, fileName);
    DOM.importModal.classList.add('visible');
    DOM.importModal.classList.remove('hidden');
  };
  reader.readAsText(file);
}

function extractGoogleSheetInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid Google Sheets URL');
  }

  const trimmedUrl = url.trim();
  const parsed = new URL(trimmedUrl);
  const hasCsvExport = /(?:export\?format=csv|pub\?output=csv|output=csv)/i.test(parsed.pathname + parsed.search);
  const publishedMatch = parsed.pathname.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  const standardMatch = parsed.pathname.match(/\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  const queryId = parsed.searchParams.get('id') || parsed.searchParams.get('key');
  const gid = parsed.searchParams.get('gid') || (parsed.hash.match(/gid=(\d+)/)?.[1]);

  const isPublishedCsv = !!publishedMatch || /\/pub/i.test(parsed.pathname) || /output=csv/i.test(parsed.search);
  const actualSheetId = standardMatch?.[1] || queryId || null;
  const publishedId = publishedMatch?.[1] || null;
  const sheetId = actualSheetId || (isPublishedCsv ? publishedId : null);

  if (!sheetId) {
    throw new Error('Could not extract sheet ID from URL. Ensure URL is a valid Google Sheets link.');
  }

  return { trimmedUrl, parsed, sheetId, actualSheetId, publishedId, gid, hasCsvExport, isPublishedCsv };
}

function buildGoogleSheetCsvUrl(url, gid = null, sheetName = null) {
  const info = extractGoogleSheetInfo(url);
  if (info.hasCsvExport) {
    if (gid && !/[?&]gid=/.test(info.trimmedUrl)) {
      const separator = info.trimmedUrl.includes('?') ? '&' : '?';
      return `${info.trimmedUrl}${separator}gid=${gid}`;
    }
    return info.trimmedUrl;
  }

  if (info.isPublishedCsv && info.publishedId) {
    const separator = info.trimmedUrl.includes('?') ? '&' : '?';
    let csvUrl = `https://docs.google.com/spreadsheets/d/e/${info.publishedId}/pub?output=csv`;
    if (gid) csvUrl += `&gid=${gid}`;
    return csvUrl;
  }

  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv&gid=${gid}`;
  }

  if (sheetName) {
    return `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  return `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv`;
}

async function fetchGoogleSheetCsv(url, gid = null, sheetName = null) {
  try {
    const response = await fetch('/api/sheets/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, gid, sheetName })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || `Google Sheets fetch failed: ${response.statusText}`);
    }

    const payload = await response.json();
    const csvText = (payload.csvData || payload.csvText || '').replace(/^\uFEFF/, '');
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('Google Sheets returned empty data');
    }
    if (/^\s*</.test(csvText)) {
      throw new Error('The URL did not return CSV data. Ensure the sheet is published as CSV or use a published CSV URL with a valid gid.');
    }

    let results = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: h => h?.trim()
    });

    if ((!results.meta.fields || results.meta.fields.length === 0) && Array.isArray(results.data) && results.data.length > 0) {
      const raw = Papa.parse(csvText, { header: false, skipEmptyLines: true, dynamicTyping: true });
      if (Array.isArray(raw.data) && raw.data.length > 1) {
        const headers = (raw.data[0] || []).map((h, idx) => String(h || `column${idx + 1}`).trim());
        const rows = raw.data.slice(1).map(row => Object.fromEntries(headers.map((header, idx) => [header, row[idx]])));
        results = { meta: { fields: headers }, data: rows };
      }
    }

    const cleanedRows = (results.data || []).filter(row => Object.values(row || {}).some(value => value !== null && value !== undefined && String(value).trim() !== ''));

    if ((!results.meta.fields || results.meta.fields.length === 0) && cleanedRows.length === 0) {
      throw new Error('No data found in Google Sheet tab');
    }

    return { results: { ...results, data: cleanedRows }, csvText, csvUrl: payload.csvUrl || '' };
  } catch (error) {
    console.error('Fetch error details:', { url, gid, sheetName, error: error.message });
    throw error;
  }
}

async function getGoogleSheetTabs(url) {
  const info = extractGoogleSheetInfo(url);
  
  // Validate URL and warn if it looks like an unpublished Google Sheets URL
  if (!info.isPublishedCsv && url.includes('docs.google.com/spreadsheets/d/')) {
    const warningMsg = 'This looks like a regular Google Sheet (not published). Please:\n\n' +
      '1. Open the Google Sheet\n' +
      '2. Go to File → Share → Publish to web\n' +
      '3. Select "Comma-separated values (.csv)" format\n' +
      '4. Copy the published URL and paste it here\n\n' +
      'Without publishing, the sheet cannot be imported.';
    showNotification(warningMsg, 'warning');
  }
  
  if (info.isPublishedCsv) {
    return [{
      id: info.publishedId || 'published_csv',
      name: 'Published CSV',
      gid: info.gid || null,
      published: true
    }];
  }

  try {
    const response = await fetch('/api/sheets/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorCode = errorBody?.code;
      
      // Provide specific guidance for common errors
      if (errorCode === 'SHEET_NOT_PUBLISHED' || response.status === 404) {
        const detailMsg = 'Sheet not accessible. This usually means:\n\n' +
          '• The sheet is not published to web, OR\n' +
          '• The sheet URL is incorrect\n\n' +
          'To fix:\n' +
          '1. Open the Google Sheet\n' +
          '2. File → Share → Publish to web\n' +
          '3. Format: CSV (.csv)\n' +
          '4. Copy the published URL\n' +
          '5. Paste it in the import dialog and try again';
        throw new Error(detailMsg);
      }
      
      throw new Error(errorBody?.error || `Unable to retrieve sheet tabs: ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload.tabs || payload.tabs.length === 0) {
      throw new Error('No tabs found in this sheet. Ensure the sheet is published to web format.');
    }
    return payload.tabs || [];
  } catch (error) {
    console.error('Sheet tabs fetch error:', { url, error: error.message });
    throw error;
  }
}

function renderGoogleSheetTabs(tabs) {
  const list = document.getElementById('sheet-tabs-list');
  const container = document.getElementById('sheet-tabs-container');
  const previewContainer = document.getElementById('sheet-preview-container');

  if (!tabs || tabs.length === 0) {
    if (list) list.innerHTML = '<p class="no-sheets">No tabs detected in this spreadsheet.</p>';
    if (container) container.style.display = 'block';
    if (previewContainer) previewContainer.style.display = 'none';
    const btn1 = document.getElementById('import-selected-tab-btn');
    const btn2 = document.getElementById('import-all-tabs-btn');
    if (btn1) btn1.style.display = 'none';
    if (btn2) btn2.style.display = 'none';
    return;
  }

  state.sheetsTabs = tabs;
  state.sheetsSelectedTab = 0;
  state.sheetsSelectedGid = (tabs[0] && tabs[0].gid) || null;

  const isPublishedFallback = tabs && tabs.length === 1 && tabs[0] && tabs[0].published;
  const rows = tabs.map((tab, idx) => `
    <label class="sheet-tab-option">
      <input type="radio" name="sheet-tab" value="${idx}" ${idx === 0 ? 'checked' : ''} ${isPublishedFallback ? 'disabled' : ''} />
      <span>${sanitizeInput(tab?.name || 'Sheet')}</span>
      <small>${tab?.published ? 'Published CSV' : tab?.gid ? `gid=${tab.gid}` : 'no gid available'}</small>
    </label>
  `).join('');

  if (list) list.innerHTML = rows;
  if (container) container.style.display = 'block';
  if (previewContainer) previewContainer.style.display = 'block';
  
  const btn1 = document.getElementById('import-selected-tab-btn');
  const btn2 = document.getElementById('import-all-tabs-btn');
  if (btn1) btn1.style.display = 'inline-flex';
  if (btn2) btn2.style.display = isPublishedFallback ? 'none' : 'inline-flex';
  
  const preview = document.getElementById('sheet-preview');
  if (preview) {
    preview.innerHTML = isPublishedFallback 
      ? '<p class="warning-text">Published CSV preview detected; tab selection is unavailable.</p>' 
      : '<p>Select a tab to preview its first rows.</p>';
  }

  document.querySelectorAll('input[name="sheet-tab"]').forEach(input => {
    input.addEventListener('change', async (event) => {
      state.sheetsSelectedTab = parseInt(event.target.value, 10);
      state.sheetsSelectedGid = (state.sheetsTabs[state.sheetsSelectedTab] && state.sheetsTabs[state.sheetsSelectedTab].gid) || null;
      await previewSelectedGoogleSheetTab();
    });
  });

  previewSelectedGoogleSheetTab();
}

function resetSheetPreviewUI() {
  state.sheetsTabs = [];
  state.sheetsSelectedTab = null;
  state.sheetsSelectedGid = null;
  const tabsContainer = document.getElementById('sheet-tabs-container');
  const previewContainer = document.getElementById('sheet-preview-container');
  const tabsList = document.getElementById('sheet-tabs-list');
  const previewPane = document.getElementById('sheet-preview');
  const importSelectedBtn = document.getElementById('import-selected-tab-btn');
  const importAllBtn = document.getElementById('import-all-tabs-btn');

  if (tabsContainer) tabsContainer.style.setProperty('display', 'none');
  if (previewContainer) previewContainer.style.setProperty('display', 'none');
  if (tabsList) tabsList.innerHTML = '';
  if (previewPane) previewPane.innerHTML = '';
  if (importSelectedBtn) importSelectedBtn.style.setProperty('display', 'none');
  if (importAllBtn) importAllBtn.style.setProperty('display', 'none');
}

async function previewSelectedGoogleSheetTab() {
  const selected = state.sheetsTabs && state.sheetsTabs[state.sheetsSelectedTab];
  if (!selected || !state.sheetsUrl) return;

  try {
    showLoadingState('Loading sheet preview...');
    const sheet = await fetchGoogleSheetCsv(state.sheetsUrl, selected.gid, selected.name);
    const headers = sheet.results.meta.fields || [];
    const rows = (sheet.results.data && sheet.results.data.slice(0, 10)) || [];
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr>' + headers.map(h => `<th>${sanitizeInput(h)}</th>`).join('') + '</tr></thead>' +
      '<tbody>' + rows.map(row => '<tr>' + headers.map(h => `<td>${sanitizeInput(String(row[h] || ''))}</td>`).join('') + '</tr>').join('') + '</tbody>';
    const preview = document.getElementById('sheet-preview');
    if (preview) {
      preview.innerHTML = '';
      preview.appendChild(table);
    }
  } catch (error) {
    const preview = document.getElementById('sheet-preview');
    if (preview) {
      // Detect if this is a "sheet not accessible" error and provide helpful guidance
      let displayMessage = error.message;
      if (error.message.includes('Unable to access this sheet') || error.message.includes('empty')) {
        displayMessage = 'Sheet not accessible. Please verify:\n• The published CSV URL is correct\n• You can access it in your browser directly\n• Try again after publishing the sheet';
      }
      preview.innerHTML = `<p class="error-text" style="white-space: pre-wrap;">${sanitizeInput(displayMessage)}</p>`;
    }
  } finally {
    hideLoadingState();
  }
}

async function importGoogleSheetTab() {
  const selected = state.sheetsTabs && state.sheetsTabs[state.sheetsSelectedTab];
  if (!selected || !state.sheetsUrl) {
    showNotification('Select a tab before importing.', 'error');
    return;
  }

  try {
    showLoadingState('Importing selected tab...');
    const { results } = await fetchGoogleSheetCsv(state.sheetsUrl, selected.gid, selected.name);
    const imported = parseSheetRowsToTasks(results);
    createOrUpdateSheetProject(state.sheetsUrl, selected.name, results.meta.fields || [], results.data || []);
    applyImportedTasks(imported, `Imported ${selected.name}`);
  } catch (error) {
    showNotification(`✗ ${error.message}`, 'error');
  } finally {
    hideLoadingState();
  }
}

async function importAllGoogleSheetTabs() {
  if (!state.sheetsUrl) {
    showNotification('Enter a Google Sheets URL first.', 'error');
    return;
  }

  try {
    showLoadingState('Importing all tabs...');
    const tabs = (state.sheetsTabs && state.sheetsTabs.length > 0) ? state.sheetsTabs : await getGoogleSheetTabs(state.sheetsUrl);
    if (!tabs || tabs.length === 0) {
      throw new Error('No tabs found to import.');
    }

    const importedTasks = [];
    const tabErrors = [];

    for (const tab of tabs) {
      try {
        const { results } = await fetchGoogleSheetCsv(state.sheetsUrl, tab.gid, tab.name);
        createOrUpdateSheetProject(state.sheetsUrl, tab.name, results.meta.fields || [], results.data || []);
        importedTasks.push(...parseSheetRowsToTasks(results));
      } catch (err) {
        tabErrors.push(`${tab.name}: ${err.message}`);
      }
    }

    applyImportedTasks(importedTasks, 'Imported all tabs');

    if (tabErrors.length > 0) {
      showNotification(`Warning: Some tabs could not be imported. ${tabErrors.join('; ')}`, 'warning', 6000);
    }
  } catch (error) {
    showNotification(`✗ ${error.message}`, 'error');
  } finally {
    hideLoadingState();
  }
}

function parseSheetRowsToTasks(results) {
  const headers = (results.meta.fields || []).map(h => String(h).trim());
  let mapping = aiMapColumns(headers);

  if (!mapping.name) {
    mapping.name = { column: headers[0] || '' };
  }
  if (!mapping.start) {
    const startColumn = headers.find(h => /start|begin|from|date/i.test(h));
    mapping.start = { column: startColumn || headers[1] || headers[0] || '' };
  }
  if (!mapping.end) {
    const endColumn = headers.find(h => /end|due|finish|to/i.test(h));
    mapping.end = { column: endColumn || headers[2] || mapping.start.column || '' };
  }
  if (!mapping.progress) {
    const progressColumn = headers.find(h => /progress|%|completion/i.test(h));
    if (progressColumn) mapping.progress = { column: progressColumn };
  }
  if (!mapping.assignedTo) {
    const assigneeColumn = headers.find(h => /assigned|owner|responsible|team|person/i.test(h));
    if (assigneeColumn) mapping.assignedTo = { column: assigneeColumn };
  }
  if (!mapping.dependencies) {
    const depColumn = headers.find(h => /dependencies|predecessors|depends|predecessor/i.test(h));
    if (depColumn) mapping.dependencies = { column: depColumn };
  }

  return results.data.map((row, index) => {
    try {
      const task = {};
      Object.entries(mapping).forEach(([field, map]) => {
        if (!map || !map.column) return;
        let value = row[map.column];
        if (field === 'start' || field === 'end') {
          if (value === undefined || value === null || value === '') return;
          // Use proper date parsing instead of direct Date constructor
          const parsedDate = parseDate(value);
          if (!parsedDate) return null;
          value = parsedDate;
        } else if (field === 'progress') {
          // Preserve numeric values, don't force to int
          const numValue = parseFloat(value);
          value = isNaN(numValue) ? 0 : Math.max(0, Math.min(100, numValue));
        } else if (field === 'dependencies') {
          // Parse dependencies: could be comma-separated IDs or task names
          if (value) {
            const depStr = String(value).trim();
            // For now, store as string; will be resolved later after all tasks are loaded
            value = depStr.length > 0 ? depStr : null;
          }
        }
        if (value !== null && value !== undefined) {
          task[field] = value;
        }
      });

      if (task.name !== undefined && task.name !== null) {
        task.name = String(task.name).trim();
      }
      if (task.assignedTo !== undefined && task.assignedTo !== null) {
        task.assignedTo = String(task.assignedTo).trim();
      }

      if (!task.name) return null;
      if (!task.start || isNaN(task.start.getTime())) return null;
      if (!task.end || isNaN(task.end.getTime())) {
        task.end = new Date(task.start);
      }

      return {
        id: generateTaskId(),
        ...task,
        class: 'blue',
        assignedTo: task.assignedTo || '',
        dependencies: task.dependencies ? parseDependencies(task.dependencies) : [],
        projectId: null // Will be set during import
      };
    } catch (err) {
      console.error(`Error parsing sheet row ${index}:`, row, err);
      return null;
    }
  }).filter(t => t !== null);
}

function applyImportedTasks(tasks, operationLabel) {
  if (!tasks || tasks.length === 0) {
    showNotification('⚠ No valid tasks found in the selected Google Sheet tab. Check column mapping and data formats.', 'info');
    return;
  }

  const normalizeTaskName = (name) => typeof name === 'string' ? name.trim().toLowerCase() : String(name || '').trim().toLowerCase();
  const existingKeys = new Set(state.tasks.map(t => `${normalizeTaskName(t.name)}|${formatDate(t.start)}|${formatDate(t.end)}`));
  const uniqueTasks = tasks.filter(t => {
    const key = `${normalizeTaskName(t.name)}|${formatDate(t.start)}|${formatDate(t.end)}`;
    return !existingKeys.has(key);
  });

  if (uniqueTasks.length === 0) {
    showNotification('⚠ No new unique tasks found. All imported rows match existing tasks by name and dates.', 'info');
    return;
  }

  // Create a project for this import if needed
  let projectId = null;
  if (state.currentProject) {
    projectId = state.currentProject.id;
  } else {
    const importProject = {
      id: generateProjectId(),
      name: `Imported - ${new Date().toLocaleDateString()}`,
      description: `Tasks imported from ${operationLabel}`,
      source: operationLabel,
      created: new Date().toISOString(),
      sheets: []
    };
    state.projects.push(importProject);
    projectId = importProject.id;
  }

  // Assign projectId to all imported tasks
  uniqueTasks.forEach(task => {
    task.projectId = projectId;
  });

  state.tasks.push(...uniqueTasks);
  saveTasks();
  refreshProjectSelector();
  resolveDependencies(); // Resolve task name references to IDs
  PROJECT_START = getProjectStart();
  calculateTaskRows();
  updateSpatialMarkers();
  render();
  renderTaskList();
  renderTimeline();
  showNotification(`✓ ${uniqueTasks.length} tasks imported from ${operationLabel}`, 'success');
}

function getSheetProjectName(url, sheetName) {
  return sheetName || 'Imported Sheet';
}

function createOrUpdateSheetProject(source, sheetName, headers, rows) {
  const projectName = getSheetProjectName(source, sheetName);
  let project = state.projects.find(p => p.name === projectName);
  if (!project) {
    project = {
      id: generateProjectId(),
      name: projectName,
      description: `Imported from Google Sheets`,
      source,
      created: new Date().toISOString(),
      sheets: []
    };
    state.projects.push(project);
  }

  project.sheets = project.sheets || [];
  project.sheets.push({
    id: generateSheetId(),
    name: sheetName || 'Imported Sheet',
    headers: headers || [],
    data: rows || [],
    created: new Date().toISOString()
  });

  saveTasks();
  renderProjectsView();
  return project;
}

async function fetchFromGoogleSheets(url, gid = null) {
  try {
    const { results } = await fetchGoogleSheetCsv(url, gid, null);
    const imported = parseSheetRowsToTasks(results);
    applyImportedTasks(imported, 'Google Sheets sync');
    return true;
  } catch (e) {
    console.error('Google Sheets sync failed:', e);
    showNotification(`✗ Sync failed: ${e.message}`, 'error');
    return false;
  }
}

function startGoogleSheetsPolling(url) {
  if (state.sheetsInterval) clearInterval(state.sheetsInterval);
  state.sheetsUrl = url;
  
  const poll = () => {
    showLoadingState("Syncing from Google Sheets...");
    return fetchFromGoogleSheets(url, state.sheetsSelectedGid).finally(hideLoadingState);
  };
  
  // First sync immediately using Promise instead of setTimeout
  Promise.resolve().then(poll);
  
  // Then schedule recurring syncs every 5 minutes
  state.sheetsInterval = setInterval(poll, 5 * 60 * 1000);
  document.getElementById('sheets-status').style.display = 'block';
  showNotification('✓ Google Sheets sync started - syncing every 5 minutes', 'success');
}

function stopGoogleSheetsPolling() {
  clearInterval(state.sheetsInterval);
  state.sheetsInterval = null;
  document.getElementById('sheets-status').style.display = 'none';
}

// Wizard Modals
function openImportWizard() { resetGoogleSheetWizardState(); state.importedData = null; state.columnMapping = {}; state.currentStep = 1; DOM.importModal.classList.remove("hidden"); goToStep(1); }
function closeImportWizard() { DOM.importModal.classList.add("hidden"); resetGoogleSheetWizardState(); state.importedData = null; state.columnMapping = {}; }

function goToStep(step) {
  state.currentStep = step;
  document.querySelectorAll(".wizard-step").forEach(s => s.classList.remove("active"));
  document.querySelector(`.wizard-step[data-step="${step}"]`)?.classList.add("active");
  document.querySelectorAll(".step").forEach((s, idx) => {
    if (idx + 1 < step) s.classList.add("completed");
    else if (idx + 1 === step) s.classList.add("active");
    else s.classList.remove("active", "completed");
  });
  if (step === 3) renderMapping();
  if (step === 4) renderImportSummary();
}

function renderPreview() {
  const table = document.getElementById("preview-table");
  let html = '<table><thead><tr>' + state.importedData.headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  state.importedData.rows.slice(0, 5).forEach(row => {
    html += '<tr>' + state.importedData.headers.map(h => `<td>${row[h]}</td>`).join('') + '</tr>';
  });
  table.innerHTML = html + '</tbody></table>';
}

function renderMapping() {
  const container = document.getElementById("mapping-container");
  container.innerHTML = ['name', 'start', 'end', 'progress', 'assignedTo', 'lat', 'lng'].map(field => `
    <div class="mapping-item">
      <label>${field}</label>
      <select id="map-${field}">
        <option value="">-- Not mapped --</option>
        ${state.importedData.headers.map(h => `<option value="${h}" ${state.columnMapping[field]?.column === h ? 'selected' : ''}>${h}</option>`).join('')}
      </select>
    </div>
  `).join('');
  
  ['name', 'start', 'end', 'progress', 'assignedTo', 'lat', 'lng'].forEach(field => {
    document.getElementById(`map-${field}`).addEventListener('change', (e) => {
      state.columnMapping[field] = e.target.value ? { column: e.target.value } : null;
    });
  });
}

function renderImportSummary() {
  const summaryLines = [
    `Source: <strong>${sanitizeInput(state.importedData.source)}</strong>`,
    `Sheet: <strong>${sanitizeInput(state.importedData.sheetName || 'Data')}</strong>`,
    `Records: <strong>${state.importedData.rows.length}</strong>`
  ];
  document.getElementById("import-summary").innerHTML = summaryLines.map(line => `<p>${line}</p>`).join('');
}

function finalImport() {
  showLoadingState("Importing tasks...");
  try {
    if (!state.importedData || !state.importedData.rows || !state.importedData.rows.length) {
      throw new Error('No data available to import. Please upload a file or load a Google Sheet tab first.');
    }

    const projectName = state.importedData.projectName || `${state.importedData.source} Project - ${state.importedData.sheetName || 'Import'}`;
    let project = state.projects.find(p => p.name === projectName);
    if (!project) {
      project = { id: generateProjectId(), name: projectName, source: state.importedData.source, created: new Date(), sheets: [] };
      state.projects.push(project);
    }
    project.sheets.push({ id: generateSheetId(), name: state.importedData.sheetName || 'Data', headers: state.importedData.headers, data: state.importedData.rows, created: new Date() });

    const existingKeys = new Set(state.tasks.map(t => `${String(t.name || '').trim().toLowerCase()}|${formatDate(t.start)}|${formatDate(t.end)}`));
    let imported = 0;

    state.importedData.rows.forEach((row) => {
      const t = {};
      Object.entries(state.columnMapping).forEach(([field, map]) => {
        if (!map) return;
        let val = row[map.column];
        if (field === 'start' || field === 'end') val = new Date(val);
        else if (field === 'progress') val = parseInt(val) || 0;
        t[field] = val;
      });
      if (!t.name) return;
      t.name = String(t.name).trim();
      const start = t.start instanceof Date && !isNaN(t.start.getTime()) ? t.start : new Date();
      const end = t.end instanceof Date && !isNaN(t.end.getTime()) ? t.end : addDays(start, 7);
      const key = `${String(t.name).trim().toLowerCase()}|${formatDate(start)}|${formatDate(end)}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      state.tasks.push({ 
        id: generateTaskId(), 
        ...t, 
        start, 
        end, 
        class: 'blue', 
        assignedTo: String(t.assignedTo || '').trim(),
        dependencies: []
      });
      imported++;
    });

    saveTasks(); 
    if (typeof KPIModals !== 'undefined' && typeof KPIModals.refresh === 'function') {
      KPIModals.refresh();
    }
    PROJECT_START = getProjectStart();
    calculateTaskRows();
    render(); 
    renderTaskList(); 
    renderTimeline();
    renderProjectsView();
    closeImportWizard(); 
    hideLoadingState(); 
    showNotification(`✓ Imported ${imported} tasks successfully`, "success");
  } catch (error) {
    hideLoadingState();
    showNotification(`✗ Import failed: ${error.message}`, "error");
  }
}

function initializeMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement || typeof L === 'undefined') return;

  if (!state.map.instance) {
    state.map.instance = L.map('map').setView([9.0765, 7.3986], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(state.map.instance);
    state.map.markersLayer = L.layerGroup().addTo(state.map.instance);
  }

  const markerCount = updateSpatialMarkers();
  if (markerCount === 0) {
    showMapPlaceholder('No site coordinates found. Add latitude/longitude values to tasks or create a location map KPI.');
  } else {
    hideMapPlaceholder();
  }

  setTimeout(async () => {
    if (state.map.instance) state.map.instance.invalidateSize();
  }, 200);
}

function updateSpatialMarkers() {
  if (!state.map.markersLayer) return 0;
  state.map.markersLayer.clearLayers();
  let markerCount = 0;

  state.tasks.forEach(task => {
    const lat = parseFloat(task.lat);
    const lng = parseFloat(task.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      markerCount += 1;
      L.marker([lat, lng]).addTo(state.map.markersLayer)
        .bindPopup(`<b>${sanitizeInput(task.name)}</b><br>Progress: ${task.progress || 0}%`);
    }
  });

  return markerCount;
}

function showMapPlaceholder(message) {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;
  let placeholder = mapElement.querySelector('.map-placeholder-message');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'map-placeholder-message';
    placeholder.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.9); color: #4b5563; font-size: 14px; text-align: center; padding: 16px; pointer-events: none; z-index: 10;';
    mapElement.appendChild(placeholder);
  }
  placeholder.textContent = message;
}

function hideMapPlaceholder() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;
  const placeholder = mapElement.querySelector('.map-placeholder-message');
  if (placeholder) {
    placeholder.remove();
  }
}

function getFilteredTasks() {
  if (!state.filterProjectId) return state.tasks;
  return state.tasks.filter(task => task.projectId === state.filterProjectId);
}

function updateSummaryKPIs() {
  const filteredTasks = getFilteredTasks();
  const total = filteredTasks.length;
  document.getElementById('total-tasks').textContent = total;
  document.getElementById('avg-progress').textContent = total ? Math.round(filteredTasks.reduce((sum, t) => sum + (t.progress || 0), 0) / total) + '%' : '0%';
}

function setProjectFilter(projectId) {
  state.filterProjectId = projectId;
  updateSummaryKPIs();
  renderStatusChart();
  renderTeamView();
}

function refreshProjectSelector() {
  const projectSelect = document.getElementById('chart-project-select');
  if (projectSelect) {
    const currentValue = projectSelect.value;
    const projectOptions = state.projects && state.projects.length > 0 ? state.projects : [];
    
    projectSelect.innerHTML = '<option value="">All Projects</option>' +
      projectOptions.map(p => `<option value="${p.id}">${sanitizeInput(p.name)}</option>`).join('');
    
    projectSelect.value = currentValue;
  }
}

function setupDynamicChartBuilder() {
  // Populate project selector with all projects
  const projectSelect = document.getElementById('chart-project-select');
  if (projectSelect) {
    const projectOptions = state.projects && state.projects.length > 0 ? state.projects : [];
    
    projectSelect.innerHTML = '<option value="">All Projects</option>' +
      projectOptions.map(p => `<option value="${p.id}">${sanitizeInput(p.name)}</option>`).join('');
  }
  
  // Setup event listeners
  document.getElementById('chart-project-select')?.addEventListener('change', (e) => {
    const projectId = e.target.value || null;
    // Apply project filter to all views
    state.filterProjectId = projectId;
    updateSummaryKPIs();
    renderStatusChart();
    renderTeamView();
    // Update dynamic chart with selected chart type
    const chartType = document.getElementById('chart-type-select')?.value || 'bar';
    renderDynamicChart(projectId, chartType);
  });
  
  document.getElementById('chart-type-select')?.addEventListener('change', (e) => {
    // Re-render dynamic chart with new type but same project filter
    const projectId = document.getElementById('chart-project-select')?.value || null;
    const chartType = e.target.value || 'bar';
    renderDynamicChart(projectId, chartType);
  });
  document.getElementById('chart-project-select')?.addEventListener('change', (e) => {
    const projectId = e.target.value || null;
    state.filterProjectId = projectId;
    
    // NEW: Use the fade wrapper
    updateDashboardWithFade(() => {
        updateSummaryKPIs();
        renderStatusChart();
        renderTeamView();
        const chartType = document.getElementById('chart-type-select')?.value || 'bar';
        renderDynamicChart(projectId, chartType);
    });
  });
  
  // Remove the old update button listener if it exists
  document.getElementById('update-chart-btn')?.removeEventListener('click', null);
  document.getElementById('update-chart-btn')?.addEventListener('click', () => {
    const projectId = document.getElementById('chart-project-select')?.value || null;
    const chartType = document.getElementById('chart-type-select')?.value || 'bar';
    renderDynamicChart(projectId, chartType);
  });
}

function renderDynamicChart(projectId, chartType) {
  const filteredTasks = projectId ? 
    state.tasks.filter(t => t.projectId === projectId) : 
    state.tasks;
  
  if (filteredTasks.length === 0) {
    showNotification('No tasks available for selected project', 'warning');
    return;
  }
  
  const canvas = document.getElementById('summary-custom-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  
  if (window.dynamicChart) window.dynamicChart.destroy();
  
  const colors = getChartColors();
  let chartConfig = {};
  
  switch (chartType) {
    case 'bar':
      // Bar Chart: Individual task progress
      chartConfig = {
        type: 'bar',
        data: {
          labels: filteredTasks.map(t => sanitizeInput(t.name)).slice(0, 15),
          datasets: [{
            label: 'Task Progress %',
            data: filteredTasks.map(t => t.progress || 0).slice(0, 15),
            backgroundColor: filteredTasks.map((t, i) => {
              const progress = t.progress || 0;
              return progress === 100 ? colors.green : progress > 50 ? colors.blue : colors.yellow;
            }).slice(0, 15),
            borderWidth: 1,
            borderColor: colors.border
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Individual Task Progress' }
          },
          scales: {
            x: { max: 100 }
          }
        }
      };
      break;
      
    case 'donut':
      // Donut Chart: Overall status distribution
      const notStarted = filteredTasks.filter(t => (t.progress || 0) === 0).length;
      const inProgress = filteredTasks.filter(t => (t.progress || 0) > 0 && (t.progress || 0) < 100).length;
      const completed = filteredTasks.filter(t => (t.progress || 0) === 100).length;
      
      chartConfig = {
        type: 'doughnut',
        data: {
          labels: ['Not Started', 'In Progress', 'Completed'],
          datasets: [{
            data: [notStarted, inProgress, completed],
            backgroundColor: [colors.red, colors.yellow, colors.green],
            borderColor: colors.border,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Status Distribution' }
          }
        }
      };
      break;
      
    case 'line':
      // Line Chart: Progress over time
      const dateTaskMap = {};
      filteredTasks.forEach(task => {
        const dates = getDatesInRange(task.start, task.end);
        dates.forEach(date => {
          if (!dateTaskMap[date]) dateTaskMap[date] = [];
          dateTaskMap[date].push(task.progress || 0);
        });
      });
      
      const sortedDates = Object.keys(dateTaskMap).sort();
      const avgProgressByDate = sortedDates.map(date =>
        Math.round(dateTaskMap[date].reduce((a, b) => a + b, 0) / dateTaskMap[date].length)
      );
      
      chartConfig = {
        type: 'line',
        data: {
          labels: sortedDates.slice(-20),
          datasets: [{
            label: 'Average Progress %',
            data: avgProgressByDate.slice(-20),
            borderColor: colors.blue,
            backgroundColor: colors.blue + '20',
            borderWidth: 2,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true },
            title: { display: true, text: 'Progress Over Time' }
          },
          scales: {
            y: { max: 100 }
          }
        }
      };
      break;

    case 'pie':
      // Pie Chart: Status distribution (alternative to donut)
      const pieNotStarted = filteredTasks.filter(t => (t.progress || 0) === 0).length;
      const pieInProgress = filteredTasks.filter(t => (t.progress || 0) > 0 && (t.progress || 0) < 100).length;
      const pieCompleted = filteredTasks.filter(t => (t.progress || 0) === 100).length;
      
      chartConfig = {
        type: 'pie',
        data: {
          labels: ['Not Started', 'In Progress', 'Completed'],
          datasets: [{
            data: [pieNotStarted, pieInProgress, pieCompleted],
            backgroundColor: [colors.red, colors.yellow, colors.green],
            borderColor: colors.border,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' },
            title: { display: true, text: 'Task Status Distribution' }
          }
        }
      };
      break;

    case 'area':
      // Area Chart: Task count and progress over time
      const dateMetrics = {};
      filteredTasks.forEach(task => {
        const dates = getDatesInRange(task.start, task.end);
        dates.forEach(date => {
          if (!dateMetrics[date]) dateMetrics[date] = { count: 0, progress: 0 };
          dateMetrics[date].count++;
          dateMetrics[date].progress += (task.progress || 0);
        });
      });
      
      const areaDatesSorted = Object.keys(dateMetrics).sort();
      const taskCountsData = areaDatesSorted.map(date => dateMetrics[date].count);
      const avgProgressData = areaDatesSorted.map(date =>
        Math.round(dateMetrics[date].progress / dateMetrics[date].count)
      );
      
      chartConfig = {
        type: 'line',
        data: {
          labels: areaDatesSorted.slice(-20),
          datasets: [
            {
              label: 'Active Tasks',
              data: taskCountsData.slice(-20),
              borderColor: colors.purple,
              backgroundColor: colors.purple + '20',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              yAxisID: 'y'
            },
            {
              label: 'Average Progress %',
              data: avgProgressData.slice(-20),
              borderColor: colors.cyan,
              backgroundColor: colors.cyan + '20',
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true },
            title: { display: true, text: 'Tasks & Progress Over Time' }
          },
          scales: {
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: { display: true, text: 'Active Tasks' }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: { display: true, text: 'Progress %' },
              max: 100,
              grid: { drawOnChartArea: false }
            }
          }
        }
      };
      break;

    case 'radar':
      // Radar Chart: Multi-dimensional task metrics
      const priorityLevels = [...new Set(filteredTasks.map(t => t.priority || 'Medium'))].slice(0, 5);
      const radarMetrics = priorityLevels.map(priority => {
        const tasksWithPriority = filteredTasks.filter(t => (t.priority || 'Medium') === priority);
        return {
          priority,
          count: tasksWithPriority.length,
          avgProgress: Math.round(
            tasksWithPriority.reduce((sum, t) => sum + (t.progress || 0), 0) / tasksWithPriority.length
          ),
          completed: tasksWithPriority.filter(t => (t.progress || 0) === 100).length
        };
      });
      
      chartConfig = {
        type: 'radar',
        data: {
          labels: radarMetrics.map(m => m.priority),
          datasets: [
            {
              label: 'Task Count',
              data: radarMetrics.map(m => m.count),
              borderColor: colors.pink,
              backgroundColor: colors.pink + '20',
              borderWidth: 2
            },
            {
              label: 'Avg Progress %',
              data: radarMetrics.map(m => m.avgProgress),
              borderColor: colors.cyan,
              backgroundColor: colors.cyan + '20',
              borderWidth: 2
            },
            {
              label: 'Completed',
              data: radarMetrics.map(m => m.completed),
              borderColor: colors.green,
              backgroundColor: colors.green + '20',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Task Metrics by Priority' }
          },
          scales: {
            r: { beginAtZero: true }
          }
        }
      };
      break;

    case 'scatter':
      // Scatter Chart: Task duration vs progress
      const scatterData = filteredTasks.map(task => ({
        x: daysBetween(new Date(task.start), new Date(task.end)),
        y: task.progress || 0,
        label: sanitizeInput(task.name)
      })).slice(0, 30);
      
      chartConfig = {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Tasks (Duration vs Progress)',
            data: scatterData.map(d => ({ x: d.x, y: d.y })),
            backgroundColor: colors.blue + '99',
            borderColor: colors.border,
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true },
            title: { display: true, text: 'Task Duration vs Completion %' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const idx = context.dataIndex;
                  const label = scatterData[idx]?.label || 'Task';
                  return `${label}: ${context.parsed.x} days, ${context.parsed.y}% done`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Duration (days)' },
              min: 0
            },
            y: {
              title: { display: true, text: 'Progress (%)' },
              min: 0,
              max: 100
            }
          }
        }
      };
      break;
  }
  
  // Apply theme-aware colors to chart config
  applyThemeToChartConfig(chartConfig, colors);
  
  const chartInstance = new Chart(canvas, chartConfig);
  window.dynamicChart = chartInstance;
  canvas.chart = chartInstance;
  document.getElementById('summary-custom-chart-title').textContent = 
    `Dynamic Chart (${chartType.charAt(0).toUpperCase() + chartType.slice(1)})`;
}

function getDatesInRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

function parseDependencies(depStr) {
  if (!depStr || typeof depStr !== 'string') return [];
  
  // Split by comma or semicolon, trim whitespace
  const depArray = depStr.split(/[,;]/);
  
  // Filter out empty strings and convert to numbers where possible
  return depArray
    .map(dep => {
      const trimmed = dep.trim();
      const asNum = parseInt(trimmed);
      return isNaN(asNum) ? trimmed : asNum;
    })
    .filter(dep => dep !== '');
}

function resolveDependencies() {
  // After all tasks are imported, resolve task name references to IDs
  const taskNameMap = {};
  state.tasks.forEach(task => {
    taskNameMap[task.name.toLowerCase()] = task.id;
  });
  
  state.tasks.forEach(task => {
    if (!task.dependencies || task.dependencies.length === 0) return;
    
    task.dependencies = task.dependencies.map(dep => {
      if (typeof dep === 'number') return dep;
      
      // Try to find task by name
      const normalizedDep = String(dep).toLowerCase().trim();
      return taskNameMap[normalizedDep] || dep;
    });
  });
}

// ============================================
// THEME MANAGEMENT
// ============================================

const ThemeManager = {
  STORAGE_KEY: 'gantt-theme-preference',
  LIGHT_THEME: 'light-theme',
  DARK_THEME: 'dark-theme',
  
  init() {
    const savedTheme = localStorage.getItem(this.STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? this.DARK_THEME : this.LIGHT_THEME);
    this.setTheme(initialTheme);
  },
  
  setTheme(theme) {
    const root = document.documentElement;
    
    if (theme === this.LIGHT_THEME) {
      root.classList.add(this.LIGHT_THEME);
      localStorage.setItem(this.STORAGE_KEY, this.LIGHT_THEME);
      document.getElementById('theme-toggle-btn').textContent = '🌙';
      document.getElementById('theme-toggle-btn').title = 'Switch to dark mode';
    } else {
      root.classList.remove(this.LIGHT_THEME);
      localStorage.setItem(this.STORAGE_KEY, this.DARK_THEME);
      document.getElementById('theme-toggle-btn').textContent = '☀️';
      document.getElementById('theme-toggle-btn').title = 'Switch to light mode';
    }
    
    // Update charts to reflect new theme
    this.updateCharts();
  },
  
  toggle() {
    const root = document.documentElement;
    const isLight = root.classList.contains(this.LIGHT_THEME);
    this.setTheme(isLight ? this.DARK_THEME : this.LIGHT_THEME);
  },
  
  updateCharts() {
    // Redraw charts when theme changes
    setTimeout(async () => {
      if (window.statusChart) {
        window.statusChart.destroy();
        renderStatusChart();
      }
      if (window.dynamicChart) {
        window.dynamicChart.destroy();
        const projectId = document.getElementById('chart-project-select')?.value || null;
        const chartType = document.getElementById('chart-type-select')?.value || 'bar';
        renderDynamicChart(projectId, chartType);
      }
    }, 100);
  }
};

const StateManager = {
  // Add new task with validation
  addTask(taskData) {
    const validation = validateTask(taskData);
    if (!validation.valid) return { success: false, error: validation.error };
    
    const newTask = {
      id: generateTaskId(),
      ...taskData,
      class: taskData.class || 'blue',
      dependencies: taskData.dependencies || [],
      projectId: taskData.projectId || null
    };
    
    state.tasks.push(newTask);
    calculateTaskRows();
    saveTasks();
    renderTaskList();
    render();
    
    return { success: true, task: newTask };
  },
  
  // Update existing task
  updateTask(taskId, updates) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, error: 'Task not found' };
    
    const updated = { ...task, ...updates };
    const validation = validateTask(updated);
    if (!validation.valid) return { success: false, error: validation.error };
    
    Object.assign(task, updates);
    calculateTaskRows();
    saveTasks();
    renderTaskList();
    render();
    
    return { success: true, task };
  },
  
  // Delete task
  deleteTask(taskId) {
    const index = state.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return { success: false, error: 'Task not found' };
    
    const deleted = state.tasks[index];
    state.tasks.splice(index, 1);
    
    // Remove this task from dependencies of other tasks
    state.tasks.forEach(task => {
      task.dependencies = task.dependencies.filter(dep => dep !== taskId);
    });
    
    calculateTaskRows();
    saveTasks();
    renderTaskList();
    render();
    
    return { success: true, task: deleted };
  },
  
  // Add project
  addProject(projectData) {
    const project = {
      id: generateProjectId(),
      name: projectData.name || 'Untitled Project',
      description: projectData.description || '',
      source: projectData.source || 'Manual',
      created: new Date().toISOString(),
      sheets: []
    };
    
    state.projects.push(project);
    saveTasks();
    renderProjectsView();
    
    return { success: true, project };
  },
  
  // Update project
  updateProject(projectId, updates) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return { success: false, error: 'Project not found' };
    
    Object.assign(project, updates);
    saveTasks();
    renderProjectsView();
    
    return { success: true, project };
  },
  
  // Delete project
  deleteProject(projectId) {
    const index = state.projects.findIndex(p => p.id === projectId);
    if (index === -1) return { success: false, error: 'Project not found' };
    
    const deleted = state.projects[index];
    
    // Remove tasks associated with this project
    const deletedTaskIds = state.tasks.filter(t => t.projectId === projectId).map(t => t.id);
    state.tasks = state.tasks.filter(t => t.projectId !== projectId);
    
    // Remove dependencies to deleted tasks
    state.tasks.forEach(task => {
      task.dependencies = task.dependencies.filter(dep => !deletedTaskIds.includes(dep));
    });
    state.projects.splice(index, 1);
    
    // Clear filter if it was the deleted project
    if (state.filterProjectId === projectId) {
      state.filterProjectId = null;
    }
    
    calculateTaskRows();
    saveTasks();
    renderProjectsView();
    renderTaskList();
    render();
    updateSummaryKPIs();
    setupDynamicChartBuilder();
    renderTeamView();
    
    return { success: true, project: deleted };
  },
  
  // Batch update tasks
  batchUpdateTasks(taskIds, updates) {
    const updated = [];
    
    taskIds.forEach(id => {
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        const newTask = { ...task, ...updates };
        const validation = validateTask(newTask);
        if (validation.valid) {
          Object.assign(task, updates);
          updated.push(task);
        }
      }
    });
    
    if (updated.length > 0) {
      calculateTaskRows();
      saveTasks();
      renderTaskList();
      render();
    }
    
    return { success: updated.length > 0, updated, skipped: taskIds.length - updated.length };
  },
  
  // Get filtered tasks with optional filters
  getFilteredTasks(filters = {}) {
    let tasks = [...state.tasks];
    
    if (filters.projectId) {
      tasks = tasks.filter(t => t.projectId === filters.projectId);
    }
    
    if (filters.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === filters.assignedTo);
    }
    
    if (filters.minProgress !== undefined) {
      tasks = tasks.filter(t => (t.progress || 0) >= filters.minProgress);
    }
    
    if (filters.maxProgress !== undefined) {
      tasks = tasks.filter(t => (t.progress || 0) <= filters.maxProgress);
    }
    
    if (filters.startBefore) {
      tasks = tasks.filter(t => t.start < filters.startBefore);
    }
    
    if (filters.endAfter) {
      tasks = tasks.filter(t => t.end > filters.endAfter);
    }
    
    return tasks;
  }
};

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.classList.contains('light-theme');
  
  return {
    red: isLight ? '#ef4444' : '#f87171',
    yellow: isLight ? '#f59e0b' : '#fbbf24',
    green: isLight ? '#10b981' : '#4ade80',
    blue: isLight ? '#3b82f6' : '#38bdf8',
    purple: isLight ? '#8b5cf6' : '#a78bfa',
    cyan: isLight ? '#06b6d4' : '#22d3ee',
    pink: isLight ? '#f43f5e' : '#ff6b9d',
    text: style.getPropertyValue('--text-primary').trim() || '#fff',
    textSecondary: style.getPropertyValue('--text-secondary').trim() || '#94a3b8',
    border: style.getPropertyValue('--border-color').trim() || '#1e293b'
  };
}

function applyThemeToChartConfig(chartConfig, colors) {
  if (!chartConfig.options) chartConfig.options = {};
  
  // Apply theme colors to all chart options
  chartConfig.options.plugins = {
    ...chartConfig.options.plugins,
    legend: {
      ...chartConfig.options.plugins?.legend,
      labels: {
        color: colors.text,
        font: { size: 12, weight: '500' }
      }
    },
    title: {
      ...chartConfig.options.plugins?.title,
      color: colors.text
    }
  };
  
  // Apply theme to scales
  if (chartConfig.options.scales) {
    Object.keys(chartConfig.options.scales).forEach(scaleKey => {
      const scale = chartConfig.options.scales[scaleKey];
      scale.ticks = {
        ...scale.ticks,
        color: colors.textSecondary,
        font: { size: 11 }
      };
      scale.grid = {
        ...scale.grid,
        color: colors.border + '40'
      };
      scale.title = {
        ...scale.title,
        color: colors.text,
        font: { size: 12, weight: 'bold' }
      };
    });
  }
}

function renderStatusChart() {
  const ctx = document.getElementById('status-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (window.statusChart) window.statusChart.destroy();
  
  const filteredTasks = getFilteredTasks();
  const notStarted = filteredTasks.filter(t => (t.progress || 0) === 0).length;
  const inProgress = filteredTasks.filter(t => (t.progress || 0) > 0 && (t.progress || 0) < 100).length;
  const completed = filteredTasks.filter(t => (t.progress || 0) === 100).length;
  
  const colors = getChartColors();

  window.statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Not Started', 'In Progress', 'Completed'],
      datasets: [{ 
        data: [notStarted, inProgress, completed], 
        backgroundColor: [colors.red, colors.yellow, colors.green], 
        borderWidth: 0,
        borderColor: colors.border
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            font: { size: 12, weight: '500' }
          }
        }
      }
    }
  });
  ctx.chart = window.statusChart;
}


function renderTeamView() {
  const teamContainer = document.getElementById('team-workload');
  if (!teamContainer) return;
  
  const teamMembers = {};
  const filteredTasks = getFilteredTasks();
  filteredTasks.forEach(task => {
    const assignee = task.assignedTo || 'Unassigned';
    if (!teamMembers[assignee]) teamMembers[assignee] = { name: assignee, total: 0, completed: 0, progress: 0 };
    teamMembers[assignee].total++;
    teamMembers[assignee].progress += task.progress || 0;
    if ((task.progress || 0) === 100) teamMembers[assignee].completed++;
  });
  
  teamContainer.innerHTML = Object.values(teamMembers).map(m => `
    <div class="team-member-card">
      <div class="team-member-name">${m.name}</div>
      <div class="team-member-stats">
        <div class="team-stat"><span class="team-stat-label">Total Tasks:</span><span class="team-stat-value">${m.total}</span></div>
        <div class="team-stat"><span class="team-stat-label">Completed:</span><span class="team-stat-value">${m.completed}</span></div>
        <div class="team-stat"><span class="team-stat-label">Avg Progress:</span><span class="team-stat-value">${Math.round(m.progress/m.total)}%</span></div>
      </div>
    </div>
  `).join('');
}

function renderProjectsView() {
  const container = document.getElementById('projects-grid');
  if (!container) return;
  container.innerHTML = state.projects.map(p => `
    <div class="project-card" data-project-id="${p.id}">
      <div class="project-card-content">
        <h3 class="project-card-name">${sanitizeInput(p.name)}</h3>
        <p class="project-card-source">📁 ${sanitizeInput(p.source)}</p>
        <p class="project-card-sheets">📊 ${p.sheets?.length || 0} sheet${p.sheets?.length !== 1 ? 's' : ''}</p>
        <p class="project-card-date">📅 ${new Date(p.created).toLocaleDateString()}</p>
      </div>
      <div class="project-card-actions">
        <button class="btn-small btn-primary project-edit-btn" data-project-id="${p.id}">Edit</button>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.project-edit-btn')) {
        const projectId = card.dataset.projectId;
        const project = state.projects.find(p => p.id === projectId);
        if (project) openProjectModal(project);
      }
    });
  });
  
  document.querySelectorAll('.project-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const projectId = btn.dataset.projectId;
      const project = state.projects.find(p => p.id === projectId);
      if (project) openProjectModal(project);
    });
  });
}

function addNewTask() {
  document.getElementById("task-form").reset();
  document.getElementById("task-form").dataset.editingTaskId = '';
  document.getElementById("task-start").value = formatDate(new Date());
  document.getElementById("task-end").value = formatDate(addDays(new Date(), 7));
  populateDependenciesSelect();
  DOM.taskModal.classList.remove("hidden");
}

function editTask(task) {
  document.getElementById("task-name").value = task.name;
  document.getElementById("task-start").value = formatDate(task.start);
  document.getElementById("task-end").value = formatDate(task.end);
  document.getElementById("task-progress").value = task.progress || 0;
  document.getElementById("task-assignee").value = task.assignedTo || "";
  document.getElementById("task-form").dataset.editingTaskId = task.id;
  
  populateDependenciesSelect(task.dependencies || []);
  DOM.taskModal.classList.remove("hidden");
}

function populateDependenciesSelect(selectedIds = []) {
  const select = document.getElementById("task-depends");
  const currentTaskId = parseInt(document.getElementById("task-form").dataset.editingTaskId) || null;
  
  select.innerHTML = state.tasks
    .filter(t => currentTaskId === null || t.id !== currentTaskId)
    .map(t => `
      <option value="${t.id}" ${selectedIds.includes(t.id) ? 'selected' : ''}>
        ${sanitizeInput(t.name)}
      </option>
    `).join('');
}

// ===== KPI CARD MANAGEMENT FUNCTIONS =====

function removeCard(cardId) {
  if (!cardId || ['total-tasks-card', 'avg-progress-card', 'status-chart-card', 'map-card'].includes(cardId)) {
    showNotification('⚠️ Cannot remove this core card', 'warning');
    return;
  }
  
  const gridItem = document.querySelector(`[data-card-id="${cardId}"]`)?.closest('.grid-stack-item');
  if (!gridItem) return;
  
  if (confirm('Are you sure you want to remove this card?')) {
    gridItem.remove();
    saveTasks();
    showNotification('✓ Card removed', 'success');
  }
}

function toggleCardLock(cardId) {
  const lockBtn = document.querySelector(`.card-lock-btn[data-card-id="${cardId}"]`);
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  const gridItem = card?.closest('.grid-stack-item');
  
  if (!lockBtn || !gridItem) return;
  
  const isLocked = state.cardLocks[cardId] || false;
  state.cardLocks[cardId] = !isLocked;
  
  if (!isLocked) {
    gridItem.classList.add('gs-locked');
    lockBtn.textContent = '🔒';
    showNotification('🔒 Card locked', 'info');
  } else {
    gridItem.classList.remove('gs-locked');
    lockBtn.textContent = '🔓';
    showNotification('🔓 Card unlocked', 'info');
  }
  
  saveTasks();
}

function editSummaryTitle() {
  const titleEl = document.getElementById('summary-title');
  const currentTitle = titleEl?.textContent || 'Project Summary';
  
  const newTitle = prompt('Enter new title:', currentTitle);
  if (newTitle && newTitle.trim()) {
    const sanitized = sanitizeInput(newTitle);
    titleEl.textContent = sanitized;
    state.summaryTitle = sanitized;
    saveTasks();
    showNotification('✓ Title updated', 'success');
  }
}

function openCreateKPIModal(cardType = 'value') {
  const modal = document.getElementById('create-kpi-modal');
  if (!modal) return;
  
  // Reset form
  document.getElementById('kpi-form')?.reset();
  document.getElementById('kpi-preview')?.style?.setProperty('display', 'none');
  
  // Set the card type
  const typeSelect = document.getElementById('kpi-card-type');
  if (typeSelect) {
    typeSelect.value = cardType;
    typeSelect.dispatchEvent(new Event('change'));
  }
  
  // Show/hide relevant sections based on card type
  updateModalForCardType(cardType);
  modal.classList.remove('hidden');
}

function updateModalForCardType(cardType) {
  // Show/hide conditional fields based on KPI type
  const columnGroup = document.getElementById('kpi-column-group');
  const filterGroup = document.getElementById('kpi-filter-group');
  const calculationSelect = document.getElementById('kpi-calculation');
  
  switch (cardType) {
    case 'stats':
      // Stats KPI - show all fields
      if (columnGroup) columnGroup.style.display = 'flex';
      if (filterGroup) filterGroup.style.display = 'flex';
      if (calculationSelect) calculationSelect.style.display = 'block';
      document.getElementById('kpi-card-title')?.setAttribute('placeholder', 'e.g., Project Progress');
      break;
      
    case 'value':
      // Value KPI - show column and filter
      if (columnGroup) columnGroup.style.display = 'flex';
      if (filterGroup) filterGroup.style.display = 'flex';
      if (calculationSelect) calculationSelect.style.display = 'block';
      document.getElementById('kpi-card-title')?.setAttribute('placeholder', 'e.g., Total Tasks Completed');
      break;
      
    case 'gantt':
      // Gantt KPI - minimal fields needed
      if (columnGroup) columnGroup.style.display = 'none';
      if (filterGroup) filterGroup.style.display = 'none';
      if (calculationSelect) calculationSelect.style.display = 'none';
      document.getElementById('kpi-card-title')?.setAttribute('placeholder', 'e.g., Project Timeline');
      break;
      
    case 'location':
      // Location KPI
      if (columnGroup) columnGroup.style.display = 'flex';
      if (filterGroup) filterGroup.style.display = 'none';
      if (calculationSelect) calculationSelect.style.display = 'none';
      document.getElementById('kpi-card-title')?.setAttribute('placeholder', 'Project Location Map');
      break;
      
    case 'photo':
      // Photo KPI
      if (columnGroup) columnGroup.style.display = 'flex';
      if (filterGroup) filterGroup.style.display = 'none';
      if (calculationSelect) calculationSelect.style.display = 'none';
      document.getElementById('kpi-card-title')?.setAttribute('placeholder', 'Project Photos');
      break;
  }
}

function closeCreateKPIModal() {
  const modal = document.getElementById('create-kpi-modal');
  if (modal) modal.classList.add('hidden');
}

// ===== INLINE FORM VALIDATION SYSTEM =====

const FormValidator = {
  // Create validation error message element
  createErrorMessage(fieldId, message) {
    let errorEl = document.querySelector(`#${fieldId}-error`);
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = `${fieldId}-error`;
      errorEl.className = 'form-error-message';
      errorEl.style.cssText = `
        color: #f87171;
        font-size: 12px;
        margin-top: 4px;
        display: block;
        animation: slideDown 0.2s ease;
      `;
      const field = document.getElementById(fieldId);
      if (field) {
        field.parentNode.insertBefore(errorEl, field.nextSibling);
      }
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    return errorEl;
  },

  clearErrorMessage(fieldId) {
    const errorEl = document.querySelector(`#${fieldId}-error`);
    if (errorEl) {
      errorEl.style.display = 'none';
    }
  },

  // Validation rules
  validateText(value, minLength = 1, maxLength = 200) {
    if (!value || value.trim().length === 0) {
      return { valid: false, message: 'This field is required' };
    }
    if (value.trim().length < minLength) {
      return { valid: false, message: `Minimum ${minLength} characters required` };
    }
    if (value.length > maxLength) {
      return { valid: false, message: `Maximum ${maxLength} characters allowed` };
    }
    return { valid: true };
  },

  validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return { valid: false, message: 'Email is required' };
    if (!regex.test(email)) {
      return { valid: false, message: 'Invalid email format' };
    }
    return { valid: true };
  },

  validateURL(url) {
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return { valid: false, message: 'Invalid URL format' };
    }
  },

  validateDate(dateStr, minDate = null, maxDate = null) {
    if (!dateStr) {
      return { valid: false, message: 'Date is required' };
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { valid: false, message: 'Invalid date format' };
    }
    if (minDate && date < new Date(minDate)) {
      return { valid: false, message: `Date must be after ${minDate}` };
    }
    if (maxDate && date > new Date(maxDate)) {
      return { valid: false, message: `Date must be before ${maxDate}` };
    }
    return { valid: true };
  },

  validateNumber(value, min = null, max = null) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, message: 'Must be a valid number' };
    }
    if (min !== null && num < min) {
      return { valid: false, message: `Minimum value is ${min}` };
    }
    if (max !== null && num > max) {
      return { valid: false, message: `Maximum value is ${max}` };
    }
    return { valid: true };
  },

  validateSelect(value, fieldName = 'This field') {
    if (!value) {
      return { valid: false, message: `Please select ${fieldName}` };
    }
    return { valid: true };
  },

  // Setup real-time validation for a field
  setupFieldValidation(fieldId, validationType, options = {}) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    // Remove existing listeners to avoid duplicates
    field.removeEventListener('blur', field.validationHandler);
    field.removeEventListener('input', field.validationDebouncedHandler);

    const validate = () => {
      let result;
      const value = field.value;

      switch (validationType) {
        case 'text':
          result = this.validateText(value, options.minLength, options.maxLength);
          break;
        case 'email':
          result = this.validateEmail(value);
          break;
        case 'url':
          result = this.validateURL(value);
          break;
        case 'date':
          result = this.validateDate(value, options.minDate, options.maxDate);
          break;
        case 'number':
          result = this.validateNumber(value, options.min, options.max);
          break;
        case 'select':
          result = this.validateSelect(value, options.fieldName);
          break;
        default:
          result = { valid: true };
      }

      if (!result.valid) {
        this.createErrorMessage(fieldId, result.message);
        field.classList.add('form-invalid');
        field.classList.remove('form-valid');
      } else {
        this.clearErrorMessage(fieldId);
        field.classList.remove('form-invalid');
        field.classList.add('form-valid');
      }

      return result.valid;
    };

    // Blur validation (strict)
    field.validationHandler = () => validate();
    field.addEventListener('blur', field.validationHandler);

    // Debounced input validation (lenient)
    let inputTimeout;
    field.validationDebouncedHandler = () => {
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        if (field.value !== '') {
          validate();
        }
      }, 300);
    };
    field.addEventListener('input', field.validationDebouncedHandler);
  },

  // Validate entire form
  validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    let isValid = true;
    const fields = form.querySelectorAll('[data-validation-type]');

    fields.forEach(field => {
      const validationType = field.getAttribute('data-validation-type');
      const options = {};

      // Parse data attributes for options
      if (field.getAttribute('data-min-length')) {
        options.minLength = parseInt(field.getAttribute('data-min-length'));
      }
      if (field.getAttribute('data-max-length')) {
        options.maxLength = parseInt(field.getAttribute('data-max-length'));
      }
      if (field.getAttribute('data-min')) {
        options.min = parseFloat(field.getAttribute('data-min'));
      }
      if (field.getAttribute('data-max')) {
        options.max = parseFloat(field.getAttribute('data-max'));
      }

      this.setupFieldValidation(field.id, validationType, options);

      // Trigger validation to get current state
      field.dispatchEvent(new Event('blur'));

      if (field.classList.contains('form-invalid')) {
        isValid = false;
      }
    });

    return isValid;
  }
};

// Add CSS styles for form validation
const addFormValidationStyles = () => {
  const styleId = 'form-validation-styles';
  if (document.getElementById(styleId)) return;

  const styles = document.createElement('style');
  styles.id = styleId;
  styles.textContent = `
    .form-invalid {
      border-color: #f87171 !important;
      background-color: rgba(248, 113, 113, 0.05) !important;
    }

    .form-valid {
      border-color: #4ade80 !important;
      background-color: rgba(74, 222, 128, 0.05) !important;
    }

    .form-error-message {
      color: #f87171;
      font-size: 12px;
      margin-top: 4px;
      display: block;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .form-control {
      transition: all 0.2s ease;
    }

    .form-control:focus {
      border-color: var(--accent-blue) !important;
    }
  `;
  document.head.appendChild(styles);
};

// Initialize form validation on page load
const initializeFormValidation = () => {
  addFormValidationStyles();

  // Setup KPI Form validation
  FormValidator.setupFieldValidation('kpi-card-title', 'text', {
    minLength: 3,
    maxLength: 100
  });
  FormValidator.setupFieldValidation('kpi-data-source', 'select', {
    fieldName: 'a data source'
  });
  FormValidator.setupFieldValidation('kpi-calculation', 'select', {
    fieldName: 'a calculation type'
  });

  // Setup Task Form validation
  FormValidator.setupFieldValidation('task-name', 'text', {
    minLength: 2,
    maxLength: 200
  });
  FormValidator.setupFieldValidation('task-start', 'date');
  FormValidator.setupFieldValidation('task-end', 'date');
  FormValidator.setupFieldValidation('task-progress', 'number', {
    min: 0,
    max: 100
  });

  // Setup Google Sheets URL validation
  FormValidator.setupFieldValidation('gsheet-url', 'url');
  FormValidator.setupFieldValidation('sheets-url', 'url');
};

function previewKPI() {
  const title = document.getElementById('kpi-card-title')?.value;
  const dataSource = document.getElementById('kpi-data-source')?.value;
  const calculation = document.getElementById('kpi-calculation')?.value;
  const column = document.getElementById('kpi-column')?.value;
  const filter = document.getElementById('kpi-filter')?.value;
  
  if (!title || !dataSource || !calculation) {
    showNotification('Please fill in required fields', 'warning');
    return;
  }
  
  const kpiData = getDynamicKPIData(dataSource, calculation, column, filter);
  const previewBox = document.getElementById('kpi-preview');
  const previewContent = document.getElementById('kpi-preview-content');
  
  if (previewContent) {
    previewContent.innerHTML = `
      <div class="kpi-preview-value">${kpiData.value}</div>
      <div class="kpi-preview-title">${sanitizeInput(title)}</div>
      <div class="kpi-preview-subtitle">${calculation} (${filter || 'all'})</div>
    `;
  }
  
  if (previewBox) previewBox.style.display = 'block';
}

function createDynamicKPI() {
  const title = document.getElementById('kpi-card-title')?.value;
  const cardType = document.getElementById('kpi-card-type')?.value || 'value';
  const dataSource = document.getElementById('kpi-data-source')?.value;
  const calculation = document.getElementById('kpi-calculation')?.value;
  const column = document.getElementById('kpi-column')?.value;
  const filter = document.getElementById('kpi-filter')?.value;
  const width = parseInt(document.getElementById('kpi-card-width')?.value) || 6;
  
  // Validate required fields
  if (!title) {
    showNotification('Please enter a card title', 'error');
    return;
  }
  
  if ((cardType === 'value' || cardType === 'stats') && !dataSource) {
    showNotification('Please select a data source', 'error');
    return;
  }
  
  if ((cardType === 'value' || cardType === 'stats') && !calculation) {
    showNotification('Please select a calculation type', 'error');
    return;
  }
  
  const cardId = 'dynamic-kpi-' + Date.now();
  const gridStack = window.gridStack || document.getElementById('summary-grid')?.gridstack;
  
  if (!gridStack) {
    showNotification('GridStack not initialized', 'error');
    return;
  }
  
  let content = '';
  
  // Generate content based on card type
  switch (cardType) {
    case 'stats':
    case 'value':
      const kpiData = getDynamicKPIData(dataSource, calculation, column, filter);
      content = `
        <div class="grid-stack-item-content summary-card" data-card-id="${cardId}">
          <div class="card-header">
            <h3>${sanitizeInput(title)}</h3>
            <div class="card-actions">
              <button class="card-lock-btn" title="Lock this card" data-card-id="${cardId}">🔓</button>
              <button class="card-remove-btn" title="Remove this card" data-card-id="${cardId}">🗑</button>
            </div>
          </div>
          <div class="kpi-value">${kpiData.value}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
            ${calculation} • ${filter || 'all'} items
          </div>
        </div>
      `;
      break;
      
    case 'gantt':
      content = `
        <div class="grid-stack-item-content summary-card" data-card-id="${cardId}">
          <div class="card-header">
            <h3>${sanitizeInput(title)}</h3>
            <div class="card-actions">
              <button class="card-lock-btn" title="Lock this card" data-card-id="${cardId}">🔓</button>
              <button class="card-remove-btn" title="Remove this card" data-card-id="${cardId}">🗑</button>
            </div>
          </div>
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
            📅 Gantt Timeline
          </div>
        </div>
      `;
      break;
      
    case 'location':
      content = `
        <div class="grid-stack-item-content summary-card" data-card-id="${cardId}">
          <div class="card-header">
            <h3>${sanitizeInput(title)}</h3>
            <div class="card-actions">
              <button class="card-lock-btn" title="Lock this card" data-card-id="${cardId}">🔓</button>
              <button class="card-remove-btn" title="Remove this card" data-card-id="${cardId}">🗑</button>
            </div>
          </div>
          <div class="map-wrapper">
            <div id="map-${cardId}" style="min-height: 300px; width: 100%;"></div>
          </div>
        </div>
      `;
      break;
      
    case 'photo':
      content = `
        <div class="grid-stack-item-content summary-card" data-card-id="${cardId}">
          <div class="card-header">
            <h3>${sanitizeInput(title)}</h3>
            <div class="card-actions">
              <button class="card-lock-btn" title="Lock this card" data-card-id="${cardId}">🔓</button>
              <button class="card-remove-btn" title="Remove this card" data-card-id="${cardId}">🗑</button>
            </div>
          </div>
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
            📸 Photo Gallery
          </div>
        </div>
      `;
      break;
  }
  
  // Add new grid item
  const newItem = gridStack.addWidget({
    w: width,
    h: 6,
    content: content
  });
  
  // Setup event listeners for the new buttons
  const lockBtn = document.querySelector(`.card-lock-btn[data-card-id="${cardId}"]`);
  const removeBtn = document.querySelector(`.card-remove-btn[data-card-id="${cardId}"]`);
  
  lockBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCardLock(cardId);
  });
  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCard(cardId);
  });
  
  // Store card configuration for future updates
  if (!state.dynamicKPIs) state.dynamicKPIs = {};
  state.dynamicKPIs[cardId] = {
    title, 
    cardType,
    dataSource, 
    calculation, 
    column, 
    filter,
    width
  };
  
  closeCreateKPIModal();
  saveTasks();
  showNotification('✓ KPI card created successfully!', 'success');
}


function setupEventListeners() {
  // Topbar
  document.getElementById("import-btn")?.addEventListener("click", openImportWizard);
  document.getElementById("add-task-btn")?.addEventListener("click", addNewTask);
  document.getElementById("save-btn")?.addEventListener("click", saveTasks);
  document.getElementById("share-btn")?.addEventListener("click", generateShareableLink);
  document.getElementById("pdf-btn")?.addEventListener("click", exportSummaryToPDF);
  document.getElementById("page-size-select")?.addEventListener('change', (e) => {
    state.summaryPageSize = e.target.value || 'a3';
  });
  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => ThemeManager.toggle());
  
  // Wizard Events
  document.getElementById("browse-btn")?.addEventListener("click", () => document.getElementById("file-input")?.click());
  document.getElementById("file-input")?.addEventListener("change", (e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); });
  document.getElementById("load-sheets-btn")?.addEventListener("click", () => {
    const url = document.getElementById("gsheet-url")?.value;
    if (!url) {
      showNotification('Enter a Google Sheets URL to continue.', 'error');
      return;
    }
    loadGoogleSheetImport(url);
  });
  document.getElementById("gsheet-url")?.addEventListener('input', () => resetGoogleSheetWizardState());
  document.getElementById("wizard-next")?.addEventListener("click", () => { if (state.currentStep < 4) goToStep(state.currentStep + 1); });
  document.getElementById("wizard-back")?.addEventListener("click", () => { if (state.currentStep > 1) goToStep(state.currentStep - 1); });
  document.getElementById("wizard-import")?.addEventListener("click", finalImport);
  document.getElementById("wizard-cancel")?.addEventListener("click", closeImportWizard);
  document.getElementById("modal-close")?.addEventListener("click", closeImportWizard);

  // Gantt scale controls
  document.getElementById('day-btn')?.addEventListener('click', () => setGanttScale('day'));
  document.getElementById('week-btn')?.addEventListener('click', () => setGanttScale('week'));
  document.getElementById('month-btn')?.addEventListener('click', () => setGanttScale('month'));

  // Form
  document.getElementById("task-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = parseInt(e.target.dataset.editingTaskId);
    const existing = state.tasks.find(t => t.id === id);
    const taskData = {
      id: id || generateTaskId(),
      name: sanitizeInput(document.getElementById("task-name").value),
      start: new Date(document.getElementById("task-start").value),
      end: new Date(document.getElementById("task-end").value),
      progress: parseInt(document.getElementById("task-progress").value) || 0,
      assignedTo: sanitizeInput(document.getElementById("task-assignee").value),
      dependencies: Array.from(document.querySelectorAll("#task-depends option:checked")).map(o => parseInt(o.value)).filter(v => !isNaN(v)),
      row: existing?.row || 0, class: 'blue'
    };
    const validation = validateTask(taskData);
    if (validation.valid) {
      UndoRedoManager.saveState(existing ? `Edit task: ${taskData.name}` : `Create task: ${taskData.name}`);
      if (existing) Object.assign(existing, taskData); else state.tasks.push(taskData);
      calculateTaskRows();
      saveTasks(); render(); renderTaskList(); DOM.taskModal.classList.add("hidden");
    } else {
      showNotification(`✗ ${validation.error}`, 'error');
    }
  });

  document.getElementById("task-modal-save")?.addEventListener("click", () => document.getElementById("task-form").dispatchEvent(new Event("submit")));
  document.getElementById("task-modal-cancel")?.addEventListener("click", () => DOM.taskModal.classList.add("hidden"));
  document.getElementById("task-modal-close")?.addEventListener("click", () => DOM.taskModal.classList.add("hidden"));

  // Sheets Sync
  document.getElementById("sync-sheets-btn")?.addEventListener("click", () => {
    const url = document.getElementById("sheets-url")?.value;
    if (url) { showNotification("Syncing...", "info"); resetSheetPreviewUI(); startGoogleSheetsPolling(url); }
  });
  document.getElementById("stop-sheets-btn")?.addEventListener("click", stopGoogleSheetsPolling);
  document.getElementById("preview-sheets-btn")?.addEventListener("click", async () => {
    const url = document.getElementById("sheets-url")?.value;
    if (!url) {
      showNotification('Enter a Google Sheets URL first.', 'error');
      return;
    }
    state.sheetsUrl = url;
    try {
      showLoadingState('Fetching sheet tabs...');
      let tabs = [];
      try {
        tabs = await getGoogleSheetTabs(url);
      } catch (err) {
        console.warn('Could not enumerate tabs, falling back to direct sheet preview:', err.message);
      }

      if (!tabs || tabs.length === 0) {
        const info = extractGoogleSheetInfo(url);
        const infoTab = { id: info.sheetId || 'sheet', name: 'Sheet 1', gid: info.gid || null };
        tabs = [infoTab];
      }

      renderGoogleSheetTabs(tabs);
      document.getElementById('sheets-status').style.display = 'none';
    } catch (err) {
      showNotification(`✗ ${err.message}`, 'error');
    } finally {
      hideLoadingState();
    }
  });
  document.getElementById('import-selected-tab-btn')?.addEventListener('click', importGoogleSheetTab);
  document.getElementById('import-all-tabs-btn')?.addEventListener('click', importAllGoogleSheetTabs);
  document.getElementById('sheets-url')?.addEventListener('input', resetSheetPreviewUI);
  
  // ===== KPI CARD MANAGEMENT LISTENERS =====
  
  // Edit summary title
  document.getElementById('edit-title-btn')?.addEventListener('click', editSummaryTitle);
  document.getElementById('summary-title')?.addEventListener('click', editSummaryTitle);
  
  // Sanitize paste into contenteditable title (force plain text only)
  document.getElementById('summary-title')?.addEventListener('paste', (e) => {
    e.preventDefault();
    const plainText = e.clipboardData?.getData('text/plain') || '';
    if (plainText) {
      // Use insertText to paste plain text only (no HTML formatting)
      document.execCommand('insertText', false, plainText.substring(0, 100));
    }
  });
  
  // Create KPI button
  document.getElementById('create-kpi-btn')?.addEventListener('click', openCreateKPIModal);
  
  // KPI Modal listeners
  document.getElementById('kpi-modal-close')?.addEventListener('click', closeCreateKPIModal);
  document.getElementById('kpi-modal-cancel')?.addEventListener('click', closeCreateKPIModal);
  document.getElementById('kpi-preview-btn')?.addEventListener('click', previewKPI);
  document.getElementById('kpi-create-btn')?.addEventListener('click', createDynamicKPI);
  
  // Update KPI column options based on data source
  document.getElementById('kpi-data-source')?.addEventListener('change', (e) => {
    const columnSelect = document.getElementById('kpi-column');
    const columnGroup = document.getElementById('kpi-column-group');
    const filterGroup = document.getElementById('kpi-filter-group');
    
    if (e.target.value === 'tasks') {
      columnSelect.innerHTML = `
        <option value="">-- Select column --</option>
        <option value="progress">Progress</option>
        <option value="name">Task Name</option>
        <option value="assignedTo">Assigned To</option>
      `;
      columnGroup.style.display = 'flex';
      filterGroup.style.display = 'flex';
    } else {
      columnGroup.style.display = 'none';
      filterGroup.style.display = 'none';
    }
  });
  
  // Setup delegation for dynamically created card buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('.card-lock-btn')) {
      const cardId = e.target.closest('.card-lock-btn')?.dataset?.cardId;
      if (cardId) toggleCardLock(cardId);
    }
    if (e.target.closest('.card-remove-btn')) {
      const cardId = e.target.closest('.card-remove-btn')?.dataset?.cardId;
      if (cardId) removeCard(cardId);
    }
  });
  
  // Project event listeners
  setupProjectEventListeners();
}

function setupRouting() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
      
      const target = document.getElementById(`view-${page}`);
      if (target) target.style.display = page === 'dashboard' ? 'flex' : 'block';
      
      if (page === 'summary') { 
        updateSummaryKPIs();
        setupDynamicChartBuilder();
        renderStatusChart(); 
        // Use requestAnimationFrame instead of setTimeout to avoid race conditions
        requestAnimationFrame(() => {
          initializeMap();
          setupCardLockListeners();
        });
        document.getElementById('share-btn').style.display = 'inline-block';
        document.getElementById('pdf-btn').style.display = 'inline-block';
      } else {
        document.getElementById('share-btn').style.display = 'none';
        document.getElementById('pdf-btn').style.display = 'none';
      }
      if (page === 'dashboard') {
        renderTaskList();
        render();
      }
      if (page === 'team') renderTeamView();
      if (page === 'projects') renderProjectsView();
    });
  });
}

async function initialize() {
  // Initialize theme
  ThemeManager.init();
  
  // Initialize PDF export worker
  PDFWorkerManager.initialize();
  
  // Check for shared view
  const shareId = getShareIdFromUrl();
  if (shareId) {
    state.sharedViewId = shareId;
    activateSharedSummaryView();
  }
  
  await loadTasks();
  if (typeof KPIModals !== 'undefined' && typeof KPIModals.refresh === 'function') {
    KPIModals.refresh();
  }
  PROJECT_START = getProjectStart();
  if (state.scale === "month") state.monthOffsets = calculateMonthOffsets(PROJECT_START, 36);
  
  renderTimeline();
  renderTaskList();
  render();
  setupEventListeners();
  updateGanttScaleButtons();
  setupRouting();
  setupInfiniteScrollTimeline();
  setupSearchFilter();
  
  // Update summary title if it was saved
  if (state.summaryTitle && state.summaryTitle !== 'Project Summary') {
    const titleEl = document.getElementById('summary-title');
    if (titleEl) titleEl.textContent = state.summaryTitle;
  }
  
  // Initialize GridStack with responsive configuration
  const initializeGridStack = () => {
    try {
      const summaryGrid = document.getElementById('summary-grid');
      if (!summaryGrid || typeof GridStack === 'undefined') return;

      // Determine grid columns based on viewport width
      const getColumnCount = () => {
        const width = window.innerWidth;
        if (width < 480) return 1;      // Mobile: < 480px
        if (width < 768) return 2;      // Tablet: 480-768px
        if (width < 1024) return 6;     // Small desktop: 768-1024px
        return 12;                       // Full desktop: >= 1024px
      };

      const columnCount = getColumnCount();

      window.gridStack = GridStack.init({
        cellHeight: 60,
        margin: 10,
        animate: true,
        float: 'down',
        column: columnCount,
        staticGrid: false,
        resizable: { handles: 'se' },
        draggable: { handle: '.card-header' },
        disableOneColumnMode: false,
        columnOpts: [
          { minW: 1, w: 1 },  // Mobile: 1 column
          { minW: 2, w: 2 },  // Tablet: 2 columns
          { minW: 6, w: 6 },  // Small desktop: 6 columns
          { minW: 12, w: 12 } // Desktop: 12 columns
        ]
      }, summaryGrid);

      // Handle resize and drag events
      if (window.gridStack) {
        window.gridStack.on('change', (event, items) => {
          if (window.gridStack.compact && typeof window.gridStack.compact === 'function') {
            window.gridStack.compact();
          }
        });
      }
    } catch (error) {
      console.warn('GridStack initialization warning:', error.message);
    }
  };

  // Handle window resize for responsive columns
  let resizeTimer;
  const handleWindowResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.gridStack) {
        const width = window.innerWidth;
        const currentColumn = window.gridStack.opts?.column || 12;
        let newColumn = currentColumn;

        if (width < 480) newColumn = 1;
        else if (width < 768) newColumn = 2;
        else if (width < 1024) newColumn = 6;
        else newColumn = 12;

        if (newColumn !== currentColumn) {
          try {
            window.gridStack.column(newColumn);
            window.gridStack.compact();
          } catch (e) {
            console.warn('GridStack responsive update failed:', e.message);
          }
        }
      }
    }, 250);
  };

  window.addEventListener('resize', handleWindowResize);
  initializeGridStack();

  setTimeout(async () => {
    // Restore locked card states
    if (state.cardLocks) {
      Object.entries(state.cardLocks).forEach(([cardId, isLocked]) => {
        if (isLocked) {
          const card = document.querySelector(`[data-card-id="${cardId}"]`);
          const gridItem = card?.closest('.grid-stack-item');
          const lockBtn = document.querySelector(`.card-lock-btn[data-card-id="${cardId}"]`);
          
          if (gridItem && lockBtn) {
            gridItem.classList.add('gs-locked');
            lockBtn.textContent = '🔒';
          }
        }
      });
    }

    if (state.sharedViewId) {
      await checkSharedViewOnLoad(state.sharedViewId);
      state.sharedViewId = null;
    }
  }, 500);
}

// ============================================
// PROJECT CRUD FUNCTIONS
// ============================================

function createNewProject() {
  const project = {
    id: generateProjectId(),
    name: `Project ${state.projects.length + 1}`,
    description: '',
    source: 'Manual',
    created: new Date().toISOString(),
    sheets: []
  };
  state.projects.push(project);
  state.currentProject = project;
  saveTasks();
  refreshProjectSelector();
  openProjectModal(project);
}

function openProjectModal(project) {
  state.currentProject = project;
  document.getElementById('project-modal-title').textContent = `${project.name}`;
  document.getElementById('project-name').value = project.name || '';
  document.getElementById('project-description').value = project.description || '';
  document.getElementById('project-source').value = project.source || 'Manual';
  document.getElementById('project-created').value = new Date(project.created).toLocaleDateString();
  
  // Populate sheets list
  const sheetsList = document.getElementById('project-sheets-list');
  sheetsList.innerHTML = project.sheets && project.sheets.length > 0 
    ? project.sheets.map(sheet => `
      <div class="sheet-item">
        <span class="sheet-name">${sanitizeInput(sheet.name)}</span>
        <div class="sheet-meta">
          <span class="sheet-columns">${sheet.headers?.length || 0} columns</span>
          <span class="sheet-rows">${sheet.data?.length || 0} rows</span>
        </div>
        <button class="btn-small btn-danger" onclick="removeSheet('${project.id}', '${sheet.id}')">Remove</button>
      </div>
    `).join('')
    : '<p class="no-sheets">No data sheets yet</p>';
  
  // Populate sheet selector
  const selector = document.getElementById('sheet-selector');
  selector.innerHTML = '<option value="">-- Choose Sheet --</option>' + 
    (project.sheets || []).map(s => `<option value="${s.id}">${sanitizeInput(s.name)}</option>`).join('');
  
  document.getElementById('project-modal').classList.remove('hidden');
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
  state.currentProject = null;
}

function saveProjectChanges() {
  if (!state.currentProject) return;
  
  const validation = validateProject({
    name: document.getElementById('project-name').value,
    description: document.getElementById('project-description').value
  });
  
  if (!validation.valid) {
    showNotification(validation.error, 'error');
    return;
  }
  
  state.currentProject.name = sanitizeInput(document.getElementById('project-name').value);
  state.currentProject.description = sanitizeInput(document.getElementById('project-description').value);
  
  saveTasks();
  refreshProjectSelector();
  renderProjectsView();
  closeProjectModal();
  showNotification('✓ Project updated successfully', 'success');
}

function deleteProject(projectId) {
  if (!projectId) return;
  
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  showConfirmDialog(
    `Delete Project: ${project.name}?`,
    'This action cannot be undone. All associated data will be lost.',
    () => {
      console.log('[CLIENT] Deleting project:', projectId);
      console.log('[CLIENT] Tasks before delete:', state.tasks.length);
      console.log('[CLIENT] Tasks with this projectId:', state.tasks.filter(t => t.projectId === projectId).length);
      
      // Remove tasks associated with this project
      const deletedTaskIds = state.tasks.filter(t => t.projectId === projectId).map(t => t.id);
      state.tasks = state.tasks.filter(t => t.projectId !== projectId);
      
      console.log('[CLIENT] Tasks after delete:', state.tasks.length);
      console.log('[CLIENT] Deleted task IDs:', deletedTaskIds);
      
      // Remove dependencies to deleted tasks
      state.tasks.forEach(task => {
        task.dependencies = task.dependencies.filter(dep => !deletedTaskIds.includes(dep));
      });
      
      state.projects = state.projects.filter(p => p.id !== projectId);
      
      // Clear filter if it was the deleted project
      if (state.filterProjectId === projectId) {
        state.filterProjectId = null;
      }
      
      refreshProjectSelector();
      calculateTaskRows();
      saveTasks().then(() => {
        // Call cleanup endpoint to ensure server-side cleanup
        fetch('/api/cleanup', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            if (data.orphanedTasksRemoved > 0) {
              console.log('[CLIENT] Server cleaned', data.orphanedTasksRemoved, 'orphaned tasks');
            }
          })
          .catch(err => console.error('[CLIENT] Cleanup endpoint error:', err));
      });
      
      renderProjectsView();
      renderTaskList();
      render();
      updateSummaryKPIs();
      renderStatusChart();
      setupDynamicChartBuilder();
      renderTeamView();
      closeProjectModal();
      showNotification('✓ Project deleted successfully', 'success');
    }
  );
}

function removeSheet(projectId, sheetId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  project.sheets = (project.sheets || []).filter(s => s.id !== sheetId);
  saveTasks();
  openProjectModal(project);
  showNotification('✓ Sheet removed', 'success');
}

function validateProject(project) {
  if (!project.name?.trim()) return { valid: false, error: 'Project name required' };
  if (project.name.trim().length > 100) return { valid: false, error: 'Project name too long (max 100 chars)' };
  return { valid: true };
}

// ============================================
// LOADING STATE SYSTEM
// ============================================

function showLoadingState(message = "Loading...") {
  let loader = document.getElementById('loading-indicator');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loading-indicator';
    loader.className = 'loading-overlay';
    loader.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p class="loading-text">${message}</p>
      </div>
    `;
    document.body.appendChild(loader);
  } else {
    loader.querySelector('.loading-text').textContent = message;
  }
  loader.classList.add('visible');
  return loader;
}

function hideLoadingState() {
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.classList.remove('visible');
  }
}

function withLoadingState(asyncFn, message = "Loading...") {
  return async function(...args) {
    showLoadingState(message);
    try {
      const result = await asyncFn(...args);
      hideLoadingState();
      return result;
    } catch (error) {
      hideLoadingState();
      throw error;
    }
  };
}

// ============================================
// UNDO/REDO SYSTEM
// ============================================

const UndoRedoManager = {
  undoStack: [],
  redoStack: [],
  maxStackSize: 50,
  
  saveState(description = 'Action') {
    try {
      const snapshot = {
        tasks: JSON.parse(JSON.stringify(state.tasks.map(t => ({
          ...t,
          start: formatDate(t.start),
          end: formatDate(t.end)
        })))),
        projects: JSON.parse(JSON.stringify(state.projects || [])),
        timestamp: Date.now(),
        description
      };
      
      this.undoStack.push(snapshot);
      this.redoStack = []; // Clear redo stack when new action is performed
      
      // Limit stack size
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
    } catch (error) {
      console.error('Error saving undo state:', error);
    }
  },
  
  undo() {
    if (this.undoStack.length === 0) {
      showNotification('⚠ Nothing to undo', 'info');
      return false;
    }
    
    try {
      // Save current state to redo stack
      const currentSnapshot = {
        tasks: JSON.parse(JSON.stringify(state.tasks.map(t => ({
          ...t,
          start: formatDate(t.start),
          end: formatDate(t.end)
        })))),
        projects: JSON.parse(JSON.stringify(state.projects || [])),
        timestamp: Date.now(),
        description: 'Current'
      };
      this.redoStack.push(currentSnapshot);
      
      // Restore previous state
      const snapshot = this.undoStack.pop();
      state.tasks = snapshot.tasks.map(t => ({
        ...t,
        start: new Date(t.start),
        end: new Date(t.end)
      }));
      state.projects = snapshot.projects || [];
      
      saveTasks();
      render();
      renderTaskList();
      renderTimeline();
      showNotification(`↶ Undone: ${snapshot.description}`, 'success');
      return true;
    } catch (error) {
      console.error('Error during undo:', error);
      showNotification(`✗ Undo failed: ${error.message}`, 'error');
      return false;
    }
  },
  
  redo() {
    if (this.redoStack.length === 0) {
      showNotification('⚠ Nothing to redo', 'info');
      return false;
    }
    
    try {
      // Save current state to undo stack
      const currentSnapshot = {
        tasks: JSON.parse(JSON.stringify(state.tasks.map(t => ({
          ...t,
          start: formatDate(t.start),
          end: formatDate(t.end)
        })))),
        projects: JSON.parse(JSON.stringify(state.projects || [])),
        timestamp: Date.now(),
        description: 'Current'
      };
      this.undoStack.push(currentSnapshot);
      
      // Restore next state
      const snapshot = this.redoStack.pop();
      state.tasks = snapshot.tasks.map(t => ({
        ...t,
        start: new Date(t.start),
        end: new Date(t.end)
      }));
      state.projects = snapshot.projects || [];
      
      saveTasks();
      render();
      renderTaskList();
      renderTimeline();
      showNotification(`↷ Redone: ${snapshot.description}`, 'success');
      return true;
    } catch (error) {
      console.error('Error during redo:', error);
      showNotification(`✗ Redo failed: ${error.message}`, 'error');
      return false;
    }
  }
};

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    UndoRedoManager.undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    UndoRedoManager.redo();
  }
});



function toggleCardLock(cardId) {
  if (!state.cardLocks) state.cardLocks = {};
  state.cardLocks[cardId] = !state.cardLocks[cardId];
  saveTasks();
  updateCardLockUI(cardId);
  showNotification(state.cardLocks[cardId] ? `🔒 Card locked` : `🔓 Card unlocked`, 'success');
}

function updateCardLockUI(cardId) {
  const btn = document.querySelector(`[data-card-id="${cardId}"] .card-lock-btn`);
  if (btn) {
    btn.textContent = state.cardLocks?.[cardId] ? '🔒' : '🔓';
    btn.title = state.cardLocks?.[cardId] ? 'Unlock card' : 'Lock card';
  }
}

function setupCardLockListeners() {
  document.querySelectorAll('.card-lock-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cardId = btn.dataset.cardId;
      toggleCardLock(cardId);
    });
  });
  
  // Update UI for all locked cards on load
  Object.keys(state.cardLocks || {}).forEach(cardId => {
    if (state.cardLocks[cardId]) updateCardLockUI(cardId);
  });
}

// ============================================
// CONFIRMATION DIALOG SYSTEM
// ============================================


function showConfirmDialog(title, message, onConfirm, onCancel = null) {
  let dialog = document.getElementById('confirm-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    dialog.className = 'modal hidden';
    dialog.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content modal-sm">
        <div class="modal-header">
          <h2 id="confirm-title">Confirm Action</h2>
          <button class="btn-close" id="confirm-close">✕</button>
        </div>
        <div class="modal-body">
          <p id="confirm-message"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }
  
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  
  const closeDialog = () => dialog.classList.add('hidden');
  const handleConfirm = () => {
    closeDialog();
    if (onConfirm) onConfirm();
  };
  const handleCancel = () => {
    closeDialog();
    if (onCancel) onCancel();
  };
  
  document.getElementById('confirm-close').onclick = handleCancel;
  document.getElementById('confirm-cancel').onclick = handleCancel;
  document.getElementById('confirm-ok').onclick = handleConfirm;
  
  dialog.classList.remove('hidden');
}

// ============================================
// TASK DELETION WITH CONFIRMATION
// ============================================

function deleteTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  showConfirmDialog(
    `Delete Task: ${task.name}?`,
    'This task will be removed from your project. This action cannot be undone.',
    () => {
      UndoRedoManager.saveState(`Delete task: ${task.name}`);
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      saveTasks();
      render();
      renderTaskList();
      updateSummaryKPIs();
      renderStatusChart();
      renderTeamView();
      renderProjectsView();
      showNotification('✓ Task deleted successfully', 'success');
    }
  );
}

// ============================================
// ENHANCED SETUP EVENT LISTENERS
// ============================================

function setupProjectEventListeners() {
  // Create project
  document.getElementById('create-project-btn')?.addEventListener('click', createNewProject);
  
  // Project modal buttons
  document.getElementById('project-modal-close')?.addEventListener('click', closeProjectModal);
  document.getElementById('project-modal-cancel')?.addEventListener('click', closeProjectModal);
  document.getElementById('project-modal-save')?.addEventListener('click', saveProjectChanges);
  document.getElementById('project-modal-delete')?.addEventListener('click', () => {
    deleteProject(state.currentProject?.id);
  });
  
  // Modal overlay click to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal?.id === 'project-modal') closeProjectModal();
      else if (modal?.id === 'task-modal') DOM.taskModal.classList.add('hidden');
      else if (modal?.id === 'import-modal') closeImportWizard();
    });
  });
  
  // Sheet selector change
  document.getElementById('sheet-selector')?.addEventListener('change', (e) => {
    const sheetId = e.target.value;
    if (!sheetId || !state.currentProject) return;
    
    const sheet = state.currentProject.sheets.find(s => s.id === sheetId);
    if (!sheet) return;
    
    const tableContainer = document.getElementById('project-data-table');
    let html = '<table class="data-table"><thead><tr>' + 
      (sheet.headers || []).map(h => `<th>${sanitizeInput(h)}</th>`).join('') + 
      '</tr></thead><tbody>';
    
    (sheet.data || []).slice(0, 10).forEach(row => {
      html += '<tr>' + (sheet.headers || []).map(h => `<td>${sanitizeInput(String(row[h] || ''))}</td>`).join('') + '</tr>';
    });
    
    tableContainer.innerHTML = html + '</tbody></table>';
  });
}

// ============================================
// ADVANCED FILTERING SYSTEM
// ============================================

const FilterManager = {
  filters: {
    searchText: '',
    assignee: '',
    progressMin: 0,
    progressMax: 100,
    startDate: null,
    endDate: null,
    status: 'all' // all, notStarted, inProgress, completed
  },
  
  setFilter(name, value) {
    this.filters[name] = value;
    this.applyFilters();
  },
  
  resetFilters() {
    this.filters = {
      searchText: '',
      assignee: '',
      progressMin: 0,
      progressMax: 100,
      startDate: null,
      endDate: null,
      status: 'all'
    };
    this.applyFilters();
  },
  
  matches(task) {
    // Search text filter
    if (this.filters.searchText) {
      const searchLower = this.filters.searchText.toLowerCase();
      if (!task.name.toLowerCase().includes(searchLower) && 
          !task.assignedTo?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    // Assignee filter
    if (this.filters.assignee) {
      if (!task.assignedTo || task.assignedTo !== this.filters.assignee) {
        return false;
      }
    }
    
    // Progress range filter
    const progress = task.progress || 0;
    if (progress < this.filters.progressMin || progress > this.filters.progressMax) {
      return false;
    }
    
    // Start date filter
    if (this.filters.startDate) {
      if (task.end < this.filters.startDate) {
        return false;
      }
    }
    
    // End date filter
    if (this.filters.endDate) {
      if (task.start > this.filters.endDate) {
        return false;
      }
    }
    
    // Status filter
    if (this.filters.status !== 'all') {
      if (this.filters.status === 'notStarted' && progress !== 0) return false;
      if (this.filters.status === 'inProgress' && (progress === 0 || progress === 100)) return false;
      if (this.filters.status === 'completed' && progress !== 100) return false;
    }
    
    return true;
  },
  
  applyFilters() {
    renderTaskList();
  },
  
  getFilteredTasks() {
    return state.tasks.filter(task => this.matches(task));
  }
};

// Update renderTaskList to use filters
function renderTaskListWithFilters() {
  try {
    DOM.taskList.innerHTML = "";
    const filteredTasks = FilterManager.getFilteredTasks();
    
    if (filteredTasks.length === 0) {
      DOM.taskList.innerHTML = '<div class="empty-state">No tasks match your filters. Try adjusting your search criteria.</div>';
      return;
    }

    filteredTasks.forEach(task => {
      try {
        const taskEl = document.createElement("div");
        taskEl.className = `task-item ${state.selectedTask?.id === task.id ? "selected" : ""}`;
        const progressColor = task.progress > 70 ? "#4ade80" : task.progress > 30 ? "#facc15" : "#ef4444";
        
        taskEl.innerHTML = `
          <div class="task-item-content">
            <div class="task-item-header">
              <h4 class="task-name">${sanitizeInput(task.name)}</h4>
              <span class="task-progress-text">${task.progress}%</span>
            </div>
            <div class="task-progress-bar"><div class="progress-bar-fill" style="width: ${task.progress}%; background: ${progressColor};"></div></div>
            <div class="task-meta">
              <span class="task-date">📅 ${formatDateDisplay(task.start)} → ${formatDateDisplay(task.end)}</span>
              <span class="task-assigned">👤 ${sanitizeInput(task.assignedTo || "Unassigned")}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="task-btn-edit">✏️</button>
            <button class="task-btn-delete">🗑️</button>
          </div>`;

        taskEl.addEventListener("click", (e) => { if (!e.target.closest(".task-actions")) selectTask(task); });
        taskEl.querySelector(".task-btn-edit").addEventListener("click", () => editTask(task));
        taskEl.querySelector(".task-btn-delete").addEventListener("click", () => deleteTask(task.id));
        DOM.taskList.appendChild(taskEl);
      } catch (err) {
        console.error('Error rendering task:', task, err);
      }
    });
  } catch (error) {
    console.error('Task list render error:', error);
    DOM.taskList.innerHTML = '<div class="error-message">Error rendering task list</div>';
  }
}

// Override renderTaskList to use filters
const originalRenderTaskList = renderTaskList;
renderTaskList = renderTaskListWithFilters;

// Update task filter input to use FilterManager
function setupSearchFilter() {
  DOM.taskFilter?.addEventListener('input', (e) => {
    FilterManager.setFilter('searchText', e.target.value);
  });
}

async function generateShareableLink() {
  try {
    showLoadingState('Generating secure link...');
    
    // 1. Gather your dashboard state (WITHOUT Base64 snapshots if possible, 
    // but if you must send snapshots, the backend handles the payload now, not the URL)
    const dashboardState = {
      kpis: {
        totalTasks: document.getElementById('total-tasks')?.textContent || '0',
        avgProgress: document.getElementById('avg-progress')?.textContent || '0%'
      },
      cards: getGridStackLayout(),
      timestamp: new Date().toISOString()
    };

    // 2. Send to backend
    const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dashboardState)
    });

    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    
    // 3. Generate clean, short URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${data.shareId}`;
    
    // 4. Copy to clipboard
    await navigator.clipboard.writeText(shareUrl);
    showNotification('Secure link copied to clipboard!', 'success');

  } catch (error) {
    console.error('Share link error:', error);
    showNotification('Failed to generate shareable link', 'error');
  } finally {
    hideLoadingState();
  }
}

function getShareIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}

async function checkSharedViewOnLoad(shareId) {
  if (!shareId) return;

  try {
    const res = await fetch(`/api/share/${shareId}`);
    if (!res.ok) throw new Error('Link expired or invalid');

    const dashboardState = await res.json();
    loadSharedView(dashboardState);
  } catch (err) {
    console.error('Shared view load failed:', err);
    showNotification('Could not load shared view', 'error');
  }
}

function activateSharedSummaryView() {
  document.body.classList.add('view-only-mode');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.style.pointerEvents = 'none';
  });

  document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
  const summaryView = document.getElementById('view-summary');
  if (summaryView) summaryView.style.display = 'block';
}

function getChartData(canvasId) {
  const canvas = document.getElementById(canvasId);
  let chartInstance = null;
  
  if (canvasId === 'summary-custom-chart' && window.dynamicChart) {
    chartInstance = window.dynamicChart;
  } else if (canvasId === 'status-chart' && window.statusChart) {
    chartInstance = window.statusChart;
  } else if (canvas?.chart) {
    chartInstance = canvas.chart;
  }
  
  if (!canvas || !chartInstance) return null;
  
  const snapshot = (() => {
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn(`Could not capture snapshot for ${canvasId}:`, e);
      return null;
    }
  })();

  return {
    type: chartInstance.config.type,
    data: {
      labels: chartInstance.data.labels,
      datasets: chartInstance.data.datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.backgroundColor,
        borderColor: ds.borderColor,
        borderWidth: ds.borderWidth,
        fill: ds.fill,
        tension: ds.tension
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: chartInstance.config.options?.plugins,
      scales: chartInstance.config.options?.scales
    },
    snapshot
  };
}

function getGridStackLayout() {
  if (!window.gridStack) return [];
  
  return window.gridStack.getGridItems().map(item => ({
    id: item.dataset.cardId,
    x: item.gridstackNode.x,
    y: item.gridstackNode.y,
    width: item.gridstackNode.width,
    height: item.gridstackNode.height,
    locked: item.classList.contains('locked')
  }));
}

function applySharedLayout(cards) {
  if (!Array.isArray(cards)) return;

  const applyLayout = () => {
    if (!window.gridStack) return false;
    cards.forEach(card => {
      const item = document.querySelector(`[data-card-id="${card.id}"]`);
      if (item) {
        window.gridStack.update(item, { x: card.x, y: card.y, width: card.width, height: card.height });
        if (card.locked) item.classList.add('locked');
      }
    });
    return true;
  };

  let attempt = 0;
  const waitForGridStack = () => {
    if (applyLayout() || attempt >= 10) return;
    attempt += 1;
    setTimeout(waitForGridStack, 200);
  };

  waitForGridStack();
}

function loadSharedView(sharedState) {
  try {
    let dashboardState = sharedState;
    if (typeof sharedState === 'string') {
      const jsonStr = decodeURIComponent(escape(atob(sharedState)));
      dashboardState = JSON.parse(jsonStr);
    }

    document.body.classList.add('view-only-mode');

    const titleEl = document.getElementById('summary-title');
    if (titleEl) {
      titleEl.removeAttribute('contenteditable');
    }

    // 2. Lock down GridStack so cards cannot be dragged or resized
    if (window.gridStack) {
        window.gridStack.setStatic(true); 
    }

    if (dashboardState.kpis) {
      document.getElementById('total-tasks').textContent = dashboardState.kpis.totalTasks;
      document.getElementById('avg-progress').textContent = dashboardState.kpis.avgProgress;
      const customKpiValue = document.getElementById('summary-custom-kpi');
      if (customKpiValue) customKpiValue.textContent = dashboardState.kpis.customKpi;
    }

    updateSummaryKPIs();
    setupDynamicChartBuilder();
    initializeMap();
    renderStatusChart();
    
    // Render custom KPI cards in shared view
    if (typeof KPIModals !== 'undefined' && KPIModals.renderSavedCards) {
      KPIModals.renderSavedCards();
    }

    if (dashboardState.charts) {
      if (dashboardState.charts.statusChart) {
        if (dashboardState.charts.statusChart.snapshot) {
          renderChartSnapshot('status-chart', dashboardState.charts.statusChart.snapshot);
        } else {
          renderChartFromData('status-chart', dashboardState.charts.statusChart);
        }
      }
      if (dashboardState.charts.customChart) {
        if (dashboardState.charts.customChart.snapshot) {
          renderChartSnapshot('summary-custom-chart', dashboardState.charts.customChart.snapshot);
        } else if (dashboardState.customChartState) {
          renderDynamicChart(dashboardState.customChartState.projectId, dashboardState.customChartState.chartType);
        } else {
          renderChartFromData('summary-custom-chart', dashboardState.charts.customChart);
        }
      } else if (dashboardState.customChartState) {
        renderDynamicChart(dashboardState.customChartState.projectId, dashboardState.customChartState.chartType);
      }
    }

    applySharedLayout(dashboardState.cards);

    document.querySelectorAll('.card-lock-btn, .grid-stack-item .btn').forEach(btn => btn.style.display = 'none');
    showNotification('Viewing shared dashboard (read-only)', 'info');
  } catch (error) {
    console.error('Error loading shared view:', error);
    showNotification('✗ Invalid shared link', 'error');
  }
}
// NEW: Transition wrapper for smooth data updates
function updateDashboardWithFade(updateCallback) {
  const cards = document.querySelectorAll('.summary-card');
  
  // Fade out
  cards.forEach(card => card.classList.add('loading-fade'));

  // Wait 200ms, swap data, fade in
  setTimeout(async () => {
    updateCallback();
    cards.forEach(card => card.classList.remove('loading-fade'));
  }, 200);
}


function renderChartSnapshot(canvasId, snapshot) {
  if (!snapshot) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentNode;
  if (!parent) return;

  const existingImage = parent.querySelector('.shared-chart-snapshot');
  if (existingImage) {
    existingImage.src = snapshot;
    return;
  }

  const img = document.createElement('img');
  img.src = snapshot;
  img.className = 'shared-chart-snapshot';
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  img.style.marginTop = '8px';

  parent.appendChild(img);
  canvas.style.display = 'none';
}

function renderChartFromData(canvasId, chartData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !chartData) return;
  
  if (!chartData.type || !chartData.data) {
    // Fallback simple rendering
    const ctx = canvas.getContext('2d');
    const colors = getChartColors();
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.text;
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Chart Data', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  // Destroy existing chart if it exists
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  try {
    // Get theme-aware colors and apply to config
    const colors = getChartColors();
    applyThemeToChartConfig(chartData, colors);
    
    // Render chart using Chart.js
    canvas.chart = new Chart(canvas, {
      type: chartData.type,
      data: chartData.data,
      options: chartData.options || {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  } catch (error) {
    console.error('Error rendering chart from data:', error);
  }
}

async function exportSummaryToPDF() {
  // HELPER: Forces the JavaScript thread to pause and lets the browser paint the UI (spinner)
  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  try {
    // Initialize PDF worker for background coordination
    if (!PDFWorkerManager.isInitialized) {
      PDFWorkerManager.initialize();
    }

    if (typeof html2pdf === 'undefined') {
      showNotification('✗ PDF export library not loaded. Please refresh the page.', 'error');
      return;
    }

    const gridElement = document.getElementById('summary-grid');
    const headerElement = document.querySelector('#view-summary .kpi-header');
    if (!gridElement) {
      showNotification('Summary grid not found', 'error');
      return;
    }

    // 1. Show loading spinner with progress updates
    const loadingModal = document.getElementById('pdf-loading-modal');
    const progressBar = loadingModal?.querySelector('.pdf-export-progress');
    
    if (loadingModal) {
      loadingModal.classList.remove('hidden');
      // Initialize progress bar if it exists
      if (progressBar) {
        progressBar.style.width = '0%';
      }
    }

    // Notify worker that PDF generation is starting
    if (PDFWorkerManager.worker) {
      PDFWorkerManager.sendMessage('generatePDF', {
        fileName: `${state.summaryTitle || 'Project Summary'}.pdf`,
        pageSize: state.summaryPageSize || 'a4',
        title: document.title
      });

      // Listen for progress updates from worker
      PDFWorkerManager.onProgress((update) => {
        if (update.type === 'progress' && progressBar) {
          progressBar.style.width = `${update.percent}%`;
          if (update.status) {
            const statusEl = loadingModal.querySelector('.pdf-export-status');
            if (statusEl) {
              statusEl.textContent = update.status;
            }
          }
        }
      });
    }

    // 2. CRITICAL: Yield to the main thread so the browser actually renders the spinner
    await yieldToMain();

    // 3. Capture image snapshots from original photo cards - with retry for lazy-loaded images
    const imageSnapshotsByUrl = new Map();
    const originalImages = Array.from(gridElement.querySelectorAll('img'));
    
    // Chunked image processing
    for (const origImg of originalImages) {
      if (origImg.complete && origImg.naturalWidth > 0 && !imageSnapshotsByUrl.has(origImg.src)) {
        try {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = origImg.naturalWidth;
          tempCanvas.height = origImg.naturalHeight;
          const ctx = tempCanvas.getContext('2d');
          ctx.drawImage(origImg, 0, 0);
          imageSnapshotsByUrl.set(origImg.src, tempCanvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('Could not capture image snapshot:', e, origImg.src);
        }
      } else if (!origImg.complete) {
        // Wait for lazy-loaded images using a Promise
        await new Promise((resolve) => {
          origImg.onload = () => {
            try {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = origImg.naturalWidth;
              tempCanvas.height = origImg.naturalHeight;
              const ctx = tempCanvas.getContext('2d');
              ctx.drawImage(origImg, 0, 0);
              imageSnapshotsByUrl.set(origImg.src, tempCanvas.toDataURL('image/png'));
            } catch (e) {
              console.warn('Could not capture loaded image:', e, origImg.src);
            }
            resolve();
          };
          origImg.onerror = () => {
            console.warn('Failed to load image for snapshot:', origImg.src);
            resolve();
          };
        });
      }
      await yieldToMain(); // Yield after processing each image
    }

    // 4. Capture map snapshots (Chunked sequentially instead of Promise.all)
    const originalMapContainers = Array.from(new Set(Array.from(gridElement.querySelectorAll('#map, [id^="map-"]'))));
    const mapSnapshotsById = new Map();
    
    for (const mapContainer of originalMapContainers) {
      const mapId = mapContainer.id;
      if (mapId && typeof window.html2canvas !== 'undefined') {
        try {
          const canvas = await window.html2canvas(mapContainer, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: true
          });
          mapSnapshotsById.set(mapId, canvas.toDataURL('image/png'));
        } catch (error) {
          console.warn('Could not capture map snapshot:', mapId, error);
        }
      }
      await yieldToMain(); // Yield after processing each map
    }

    // 5. Create PDF wrapper including header and grid
    const pdfWrapper = document.createElement('div');
    pdfWrapper.style.cssText = `
      width: 100%;
      height: auto;
      background: #ffffff;
      overflow: visible;
      display: flex;
      flex-direction: column;
    `;
    
    // Clone and style header if present
    if (headerElement) {
      const clonedHeader = headerElement.cloneNode(true);
      clonedHeader.style.cssText = `
        padding: 20px;
        background: #ffffff;
        border-bottom: 2px solid #e0e0e0;
        flex-shrink: 0;
        page-break-after: avoid;
        page-break-inside: avoid;
      `;
      
      // Remove action buttons from header
      clonedHeader.querySelectorAll('.kpi-actions, .kpi-selector').forEach(el => {
        el.style.display = 'none';
      });
      
      // Style title prominently
      const titleEl = clonedHeader.querySelector('.editable-title');
      if (titleEl) {
        titleEl.style.cssText = `
          font-size: 28px !important;
          font-weight: 700 !important;
          color: #000000 !important;
          margin: 0 0 10px 0 !important;
        `;
      }
      
      pdfWrapper.appendChild(clonedHeader);
    }

    // Clone grid
    const clonedGrid = gridElement.cloneNode(true);
    
    // Remove interactive buttons
    clonedGrid.querySelectorAll('.card-lock-btn, .card-remove-btn').forEach(btn => {
      btn.style.visibility = 'hidden';
      btn.style.width = '0';
      btn.style.padding = '0';
      btn.style.margin = '0';
    });

    // 6. Capture chart snapshots (Chunked sequentially)
    const originalCanvases = Array.from(gridElement.querySelectorAll('canvas'));
    const chartSnapshotsById = new Map();

    for (const origCanvas of originalCanvases) {
      const canvasId = origCanvas.id;
      let snapshot = null;

      try {
        // Try to get snapshot from Chart.js instance first
        if (canvasId === 'status-chart' && window.statusChart) {
          const chartCanvas = window.statusChart.canvas || origCanvas;
          snapshot = chartCanvas.toDataURL('image/png');
        } else if (origCanvas.chart) {
          const chartCanvas = origCanvas.chart.canvas || origCanvas;
          snapshot = chartCanvas.toDataURL('image/png');
        } else if (origCanvas.width > 0 && origCanvas.height > 0) {
          snapshot = origCanvas.toDataURL('image/png');
        }
      } catch (e) {
        console.warn(`Could not capture chart ${canvasId}:`, e);
        try {
          if (origCanvas.width > 0 && origCanvas.height > 0) {
            snapshot = origCanvas.toDataURL('image/png');
          }
        } catch (e2) {
          console.warn(`Backup canvas capture failed for ${canvasId}`);
        }
      }

      if (snapshot && canvasId) {
        chartSnapshotsById.set(canvasId, snapshot);
      }
      await yieldToMain(); // Yield after processing each chart
    }

    // Replace canvases with snapshot images
    clonedGrid.querySelectorAll('canvas').forEach((canvas) => {
      const canvasId = canvas.id;
      const snapshot = chartSnapshotsById.get(canvasId);

      if (snapshot) {
        const img = document.createElement('img');
        img.src = snapshot;
        img.style.cssText = `
          width: 100% !important;
          height: auto !important;
          display: block !important;
          max-width: 100% !important;
          page-break-inside: avoid !important;
        `;
        canvas.parentNode.replaceChild(img, canvas);
      } else {
        canvas.style.cssText = `
          width: 100% !important;
          height: auto !important;
          display: block !important;
        `;
      }
    });

    // Replace map containers with snapshots
    clonedGrid.querySelectorAll('#map, [id^="map-"]').forEach((mapContainer) => {
      const mapId = mapContainer.id;
      const snapshot = mapSnapshotsById.get(mapId);
      if (snapshot) {
        const img = document.createElement('img');
        img.src = snapshot;
        img.style.cssText = `
          width: 100% !important;
          height: auto !important;
          object-fit: cover !important;
          display: block !important;
          page-break-inside: avoid !important;
        `;
        mapContainer.parentNode.replaceChild(img, mapContainer);
      }
    });

    // Update image sources with snapshots
    clonedGrid.querySelectorAll('img').forEach((img) => {
      const snapshot = imageSnapshotsByUrl.get(img.src);
      if (snapshot) {
        img.src = snapshot;
      }
      
      img.style.cssText = `
        width: 100% !important;
        height: auto !important;
        display: block !important;
        page-break-inside: avoid !important;
      `;
    });

    // Preserve cloned grid layout without forcing page-size column rules
    clonedGrid.style.cssText = `
      width: 100%;
      height: auto;
      padding: 20px;
      background: #ffffff;
      overflow: visible;
    `;

    // Style grid items to not cut off - allow cards to span multiple pages naturally
    clonedGrid.querySelectorAll('.grid-stack-item').forEach(card => {
      card.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        background: #ffffff !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
        padding: 16px !important;
        min-height: 240px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      `;
    });

    // Style full-width cards (like map) properly
    clonedGrid.querySelectorAll('.grid-stack-item[gs-w="12"]').forEach(card => {
      card.style.cssText = `
        grid-column: 1 / -1 !important;
        display: flex !important;
        flex-direction: column !important;
        background: #ffffff !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
        padding: 16px !important;
        min-height: 300px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      `;
    });

    // Style card headers
    clonedGrid.querySelectorAll('.card-header').forEach(header => {
      header.style.cssText = `
        margin: 0 0 12px 0 !important;
        padding-bottom: 12px !important;
        border-bottom: 1px solid #eee !important;
      `;
      
      header.querySelectorAll('h3').forEach(h => {
        h.style.cssText = 'color: #000 !important; margin: 0 !important; font-size: 16px !important;';
      });
    });

    // Fix colors in cloned content - robust approach using computed styles
    clonedGrid.querySelectorAll('[style*="color"]').forEach(el => {
      const computed = window.getComputedStyle(el);
      const color = computed.color;
      // If color is not black/dark enough, override it
      if (color && !color.includes('rgb(0, 0, 0)') && !color.includes('#000')) {
        el.style.color = '#000000 !important';
      }
    });

    clonedGrid.querySelectorAll('.kpi-value').forEach(el => {
      el.style.cssText = 'color: #000000 !important; font-size: 32px !important; font-weight: 700 !important;';
    });

    pdfWrapper.appendChild(clonedGrid);

    // PDF generation settings
    const pdfFormat = (() => {
      if (state.summaryPageSize === 'custom') {
        const pxToMm = (px) => px * 0.264583;
        return [Math.max(210, Math.round(gridElement.scrollWidth * pxToMm)), Math.max(297, Math.round(gridElement.scrollHeight * pxToMm))];
      }
      return ['a4', 'a3', 'letter'].includes(state.summaryPageSize) ? state.summaryPageSize : 'a3';
    })();

    const opt = {
      margin: [8, 8, 8, 8],
      filename: `KPI-Dashboard-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'png', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        foreignObjectRendering: true,
        imageTimeout: 15000,
        backgroundColor: '#ffffff',
        scrollY: 0,
        logging: false,
        allowTaint: true
      },
      jsPDF: {
        orientation: 'landscape',
        unit: 'mm',
        format: pdfFormat,
        compress: true,
        precision: 10
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        before: '.grid-stack-item',
        after: '.grid-stack-item'
      }
    };

    // Append to DOM for rendering - use A3 width (297mm ≈ 1122px at 96dpi)
    const containerWidth = state.summaryPageSize === 'a4' ? '840px' : '1122px';
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `position: absolute; left: -9999px; top: 0; width: ${containerWidth}; overflow: visible; visibility: hidden;`;
    tempContainer.appendChild(pdfWrapper);
    document.body.appendChild(tempContainer);

    // 7. YIELD one final time before kicking off the heavy PDF worker
    await yieldToMain();

    return new Promise((resolve) => {
      html2pdf()
        .set(opt)
        .from(pdfWrapper)
        .save()
        .then(() => {
          showNotification('✓ PDF exported successfully!', 'success');
          resolve();
        })
        .catch((error) => {
          console.error('PDF generation failed:', error);
          showNotification('✗ PDF export failed: ' + error.message, 'error');
          resolve();
        })
        .finally(() => {
          // Hide loading spinner
          if (loadingModal) {
            loadingModal.classList.add('hidden');
          }
          // Clean up temporary container and event listeners
          try {
            originalImages.forEach(img => {
              img.onload = null;
              img.onerror = null;
            });
            if (tempContainer.parentNode) {
              document.body.removeChild(tempContainer);
            }
          } catch (e) {
            console.warn('Could not remove temp container:', e);
          }
        });
    });
  } catch (error) {
    console.error('Export error:', error);
    showNotification('✗ Export failed: ' + error.message, 'error');
    
    // Ensure the loading modal is hidden in case of a fatal try/catch error
    const loadingModal = document.getElementById('pdf-loading-modal');
    if (loadingModal) {
      loadingModal.classList.add('hidden');
    }
  }
}

document.addEventListener("DOMContentLoaded", initialize);

// Initialize form validation after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(initializeFormValidation, 100);
});