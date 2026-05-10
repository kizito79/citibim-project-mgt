// ============================================
// KPI MODALS SYSTEM - Professional Implementation
// Handles all KPI card creation modals
// ============================================

const KPIModals = {
  projects: [],
  projectFields: {},
  kpiCards: [],     // Store created KPI cards
  DEBUG: false,     // Set to true for verbose logging

  /**
   * Initialize all modal event listeners
   */
  init() {
    try {
      this.loadProjects();
      this.loadSavedCards();
      this.renderSavedCards();
      this.setupModalEventListeners();
      this.setupModalButtons();
      this.log('KPI Modal system initialized successfully');
    } catch (error) {
      console.error('Error initializing KPI modals:', error);
    }
  },

  /**
   * Debug logging utility
   */
  log(...args) {
    if (this.DEBUG) {
      console.log('[KPIModals]', ...args);
    }
  },

  /**
   * Load projects and their fields (integrate with your data source)
   */
  loadProjects() {
    // Load from actual dashboard state first
    this.projects = [];
    this.projectFields = {};

    if (typeof state !== 'undefined' && Array.isArray(state.projects)) {
      this.projects = state.projects.map(p => ({ id: p.id, name: p.name }));
      state.projects.forEach(project => {
        let headers = [];

        if (Array.isArray(project.sheets) && project.sheets.length > 0) {
          headers = project.sheets.reduce((fieldList, sheet) => {
            const sheetHeaders = Array.isArray(sheet.headers) && sheet.headers.length > 0
              ? sheet.headers
              : Object.keys(sheet.data?.[0] || {});
            return [...new Set([...fieldList, ...sheetHeaders])];
          }, []);
        }

        if (!headers.length) {
          headers = this.getFieldsFromTasks(project.id);
        }

        this.projectFields[project.id] = headers;
      });

      this.log('Projects loaded from state');
      return;
    }

    // Fallback to saved project metadata only if dashboard state is unavailable.
    const savedProjects = localStorage.getItem('kpi-projects');
    if (savedProjects) {
      try {
        const data = JSON.parse(savedProjects);
        this.projects = data.projects || [];
        this.projectFields = data.fields || {};
        this.log('Projects loaded from localStorage fallback');
        return;
      } catch (error) {
        this.log('Error loading projects from localStorage:', error);
      }
    }

    if (typeof state !== 'undefined' && Array.isArray(state.tasks) && state.tasks.length > 0) {
      this.projects = [
        { id: String(Math.max(...state.tasks.map(t => Number(t.projectId) || 0), 0) + 1), name: 'Current Project' }
      ];
      this.projectFields[this.projects[0].id] = this.getFieldsFromTasks();
      this.log('Projects loaded from current task state');
    } else {
      this.projects = [];
      this.projectFields = {};
      this.log('No projects or tasks available. Add data via import.');
    }
  },

  /**
   * Refresh KPI project and field dropdown data
   */
  refresh() {
    this.loadProjects();
    this.populateProjectSelects();
  },

  /**
   * Save projects to localStorage
   */
  saveProjects() {
    try {
      localStorage.setItem('kpi-projects', JSON.stringify({
        projects: this.projects,
        fields: this.projectFields
      }));
      this.log('Projects saved to localStorage');
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  },

  /**
   * Load saved KPI cards from localStorage
   */
  loadSavedCards() {
    try {
      const saved = localStorage.getItem('kpi-cards');
      if (saved) {
        this.kpiCards = JSON.parse(saved);
        if (typeof state !== 'undefined' && Array.isArray(state.projects)) {
          const validProjectIds = new Set(state.projects.map(project => String(project.id)));
          this.kpiCards = this.kpiCards.filter(card => !card.project || validProjectIds.has(String(card.project)));
          this.saveCards();
        }
        this.log('Loaded', this.kpiCards.length, 'saved KPI cards');
      }
    } catch (error) {
      this.log('Error loading saved cards:', error);
    }
  },

  waitForGridStack(timeout = 5000) {
    return new Promise(resolve => {
      const start = Date.now();
      const attempt = () => {
        const gridStack = this.getGridStack();
        if (gridStack || Date.now() - start >= timeout) {
          return resolve(gridStack || null);
        }
        setTimeout(attempt, 100);
      };
      attempt();
    });
  },

  renderSavedCards() {
    if (!Array.isArray(this.kpiCards) || this.kpiCards.length === 0) return;

    this.waitForGridStack(2500).then((gridStack) => {
      if (!gridStack) {
        this.log('GridStack was not ready when rendering saved KPI cards');
      }

      this.kpiCards.forEach(cardData => {
        this.addCardToGrid(cardData, false);
      });
    });
  },

  /**
   * Save KPI cards to localStorage
   */
  saveCards() {
    try {
      localStorage.setItem('kpi-cards', JSON.stringify(this.kpiCards));
      this.log('KPI cards saved to localStorage');
    } catch (error) {
      console.error('Error saving KPI cards:', error);
    }
  },

  /**
   * Add custom projects programmatically
   */
  addProject(id, name, fields) {
    this.projects.push({ id, name });
    this.projectFields[id] = fields || [];
    this.saveProjects();
    this.log('Project added:', name);
  },

  /**
   * Get fields from task data
   */
  getFieldsFromTasks(projectId) {
    const rows = this.getProjectData(projectId);
    if (!rows || rows.length === 0) return [];
    const firstRow = rows[0];
    return Object.keys(firstRow || {}).filter(key => !key.startsWith('_'));
  },

  getProjectData(projectId) {
    if (typeof state === 'undefined') return [];

    if (!projectId) {
      const allRows = [];
      if (Array.isArray(state.projects)) {
        state.projects.forEach(project => {
          if (Array.isArray(project.sheets)) {
            project.sheets.forEach(sheet => {
              if (Array.isArray(sheet.data)) {
                allRows.push(...sheet.data);
              }
            });
          }
        });
      }
      if (allRows.length) return allRows;
      return Array.isArray(state.tasks) ? [...state.tasks] : [];
    }

    if (Array.isArray(state.projects)) {
      const project = state.projects.find(p => String(p.id) === String(projectId));
      if (project && Array.isArray(project.sheets)) {
        const sheetRows = project.sheets.reduce((acc, sheet) => acc.concat(Array.isArray(sheet.data) ? sheet.data : []), []);
        if (sheetRows.length > 0) return sheetRows;
      }
    }

    if (Array.isArray(state.tasks)) {
      return state.tasks.filter(task => String(task.projectId) === String(projectId));
    }

    return [];
  },

  /**
   * Populate project select dropdowns
   */
  populateProjectSelects() {
    const selects = [
      'stats-project-select',
      'value-project-select',
      'gantt-project-select',
      'location-project-select',
      'photo-project-select'
    ];

    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        // Keep the default option
        const defaultOption = select.querySelector('option[value=""]');
        select.innerHTML = '';
        if (defaultOption) {
          select.appendChild(defaultOption.cloneNode(true));
        }
        
        this.projects.forEach(project => {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          select.appendChild(option);
        });
      }
    });
  },

  /**
   * Populate field selects based on selected project
   */
  populateFieldSelect(projectSelectId, fieldSelectId, dateFieldsOnly = false) {
    const projectSelect = document.getElementById(projectSelectId);
    const fieldSelect = document.getElementById(fieldSelectId);

    if (projectSelect && fieldSelect) {
      projectSelect.addEventListener('change', (e) => {
        const projectId = e.target.value;
        const fields = this.projectFields[projectId] || [];
        
        fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
        
        fields.forEach(field => {
          const option = document.createElement('option');
          option.value = field;
          option.textContent = field;
          fieldSelect.appendChild(option);
        });
      });
    }
  },

  /**
   * Setup modal event listeners
   */
  setupModalEventListeners() {
    // Modal close buttons
    document.querySelectorAll('[data-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const modalId = btn.dataset.modal;
        this.closeModal(modalId);
      });
    });

    // Modal close links
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const modalId = btn.dataset.modalClose;
        this.closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          const modal = overlay.closest('.modal');
          if (modal && modal.id) {
            this.closeModal(modal.id);
          }
        }
      });
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal:not(.hidden)');
        if (openModal && openModal.id) {
          this.closeModal(openModal.id);
        }
      }
    });

    // Populate project selects
    this.populateProjectSelects();

    // Setup field select listeners
    this.populateFieldSelect('stats-project-select', 'stats-field-select');
    this.populateFieldSelect('value-project-select', 'value-field-select');
    this.populateFieldSelect('gantt-project-select', 'gantt-start-field');
    this.populateFieldSelect('gantt-project-select', 'gantt-end-field');
    this.populateFieldSelect('location-project-select', 'location-lat-field');
    this.populateFieldSelect('location-project-select', 'location-lon-field');
    this.populateFieldSelect('location-project-select', 'location-photo-field');
    this.populateFieldSelect('photo-project-select', 'photo-source-field');
  },

  /**
   * Setup action buttons to open modals
   */
  setupModalButtons() {
    // Create Stats KPI
    // Replace the old listeners with these:
document.getElementById('create-stats-kpi-btn')?.addEventListener('click', () => KPIModals.KPIBuilder.open('stats'));
document.getElementById('create-value-kpi-btn')?.addEventListener('click', () => KPIModals.KPIBuilder.open('value'));
document.getElementById('create-gantt-kpi-btn')?.addEventListener('click', () => KPIModals.KPIBuilder.open('gantt'));

// The unified Create button
document.getElementById('builder-create-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (KPIModals.KPIBuilder.validate()) {
        const cardData = KPIModals.KPIBuilder.extractCardData();
        KPIModals.addCardToGrid(cardData);
        if (typeof showNotification === 'function') {
          showNotification('✓ KPI card created successfully!', 'success');
        }
        KPIModals.closeModal('modal-kpi-builder');
    }
});

    // Add Project Location
    document.getElementById('add-project-location-btn')?.addEventListener('click', () => {
      this.openModal('modal-add-project-location');
    });

    // Add Project Photo
    document.getElementById('add-project-photo-btn')?.addEventListener('click', () => {
      this.openModal('modal-add-project-photo');
    });

    // Setup create buttons
    document.getElementById('stats-create-btn')?.addEventListener('click', () => {
      this.createStatsCard();
    });

    document.getElementById('value-create-btn')?.addEventListener('click', () => {
      this.createValueCard();
    });

    document.getElementById('location-create-btn')?.addEventListener('click', () => {
      this.createLocationCard();
    });

    document.getElementById('photo-create-btn')?.addEventListener('click', () => {
      this.createPhotoCard();
    });

    // Setup preview buttons
    document.querySelectorAll('.btn-preview').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = btn.closest('.modal');
        this.showPreview(modal);
      });
    });

    // Setup editable title
    this.setupEditableTitle();
  },

  /**
   * Setup editable title functionality
   */
 setupEditableTitle() {
    const titleElement = document.getElementById('summary-title');
    const saveBtn = document.getElementById('edit-title-save-btn');
    
    if (titleElement) {
      titleElement.addEventListener('click', () => {
        titleElement.focus();
      });

      // NEW: Intercept paste to force plain text only
      titleElement.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      });

      titleElement.addEventListener('blur', () => {
        this.saveTitle(titleElement.textContent);
      });

      titleElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleElement.blur();
        }
      });
    }
  },

  /**
   * Save edited title
   */
  saveTitle(newTitle) {
    // Persist title (connect with your backend)
    console.log('Title saved:', newTitle);
    localStorage.setItem('kpi-page-title', newTitle);
  },

  /**
   * Open modal
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      // Focus first input
      setTimeout(() => {
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
      }, 100);
    }
  },

  /**
   * Close modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      // Reset form
      const form = modal.querySelector('form') || modal;
      if (form.reset) form.reset();
    }
  },

  /**
   * Validate required fields
   */
  validateForm(formFields) {
    for (const field of formFields) {
      if (!field.value || field.value.trim() === '') {
        const message = `Please fill in: ${field.labels ? field.labels[0]?.textContent : 'required field'}`;
        if (typeof showNotification === 'function') {
          showNotification(message, 'error');
        } else {
          alert(message);
        }
        field.focus();
        return false;
      }
    }
    return true;
  },

  /**
   * Create Stats/Chart KPI Card
   */
// Add this inside your KPIModals object in kpi-modals.js

KPIBuilder: {
    currentKpiType: null,

    // 1. Open the modal and set the context
    open(type) {
        this.currentKpiType = type; // 'stats', 'value', or 'gantt'
        
        // Update Title
        const titles = { stats: 'Stats Chart', value: 'Data Value', gantt: 'Gantt Timeline' };
        document.getElementById('kpi-builder-title').textContent = `Create ${titles[type]} KPI`;

        // Reset Form & Errors
        document.getElementById('kpi-builder-form').reset();
        this.clearErrors();
        
        // Inject Dynamic Fields
        this.injectDynamicFields(type);
        
        // Bind Live Preview Listener
        this.bindLivePreview();

        KPIModals.openModal('modal-kpi-builder');
    },

    // 2. Inject specific fields based on type
    injectDynamicFields(type) {
        const container = document.getElementById('builder-dynamic-fields');
        let html = '';

        if (type === 'stats') {
            html = `
                <div class="form-group">
                  <label>Select Field/Column *</label>
                  <select id="builder-field-select" class="form-control builder-trigger-preview" data-required="true">
                    <option value="">-- Select Field --</option>
                  </select>
                  <span class="error-text">Field selection is required.</span>
                </div>
                <div class="form-group">
                  <label>Chart Type *</label>
                  <select id="builder-chart-type" class="form-control builder-trigger-preview" data-required="true">
                    <option value="bar">Bar Chart</option>
                    <option value="donut">Donut Chart</option>
                    <option value="line">Line Chart</option>
                  </select>
                </div>
            `;
        } else if (type === 'value') {
            html = `
                <div class="form-group">
                  <label>Select Field/Column *</label>
                  <select id="builder-field-select" class="form-control builder-trigger-preview" data-required="true">
                    <option value="">-- Select Field --</option>
                  </select>
                  <span class="error-text">Field selection is required.</span>
                </div>
                <div class="form-group">
                  <label>Calculation Type *</label>
                  <select id="builder-calc-type" class="form-control builder-trigger-preview" data-required="true">
                    <option value="sum">Sum</option>
                    <option value="average">Average</option>
                    <option value="count">Count</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Display Type</label>
                  <select id="builder-display-type" class="form-control builder-trigger-preview">
                    <option value="number">Number</option>
                    <option value="percentage">Percentage</option>
                    <option value="currency">Currency</option>
                    <option value="decimal">Decimal</option>
                  </select>
                </div>
            `;
        } else if (type === 'gantt') {
            html = `
                <div class="form-group">
                  <label>Start Date Field *</label>
                  <select id="builder-start-field" class="form-control builder-trigger-preview" data-required="true">
                    <option value="">-- Select Field --</option>
                  </select>
                  <span class="error-text">Start field is required.</span>
                </div>
                <div class="form-group">
                  <label>End Date Field *</label>
                  <select id="builder-end-field" class="form-control builder-trigger-preview" data-required="true">
                    <option value="">-- Select Field --</option>
                  </select>
                  <span class="error-text">End field is required.</span>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Re-populate the dynamically injected dropdowns based on state.projects
        KPIModals.populateFieldSelect('builder-project-select', 'builder-field-select');
        if (type === 'gantt') {
            KPIModals.populateFieldSelect('builder-project-select', 'builder-start-field');
            KPIModals.populateFieldSelect('builder-project-select', 'builder-end-field');
        }
    },

    // 3. Inline Validation Engine
    validate() {
        this.clearErrors();
        let isValid = true;
        const requiredFields = document.querySelectorAll('#kpi-builder-form [data-required="true"]');

        requiredFields.forEach(field => {
            if (!field.value || field.value.trim() === '') {
                field.classList.add('input-error');
                isValid = false;
                
                // Optional: Auto-focus the first error
                if(isValid === false && field === requiredFields[0]) field.focus();
            }
        });

        return isValid;
    },

    clearErrors() {
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    },

    // 4. Live Preview Binding (Debounced)
    bindLivePreview() {
        const form = document.getElementById('kpi-builder-form');
        let debounceTimer;

        form.addEventListener('input', (e) => {
            // Remove error state as soon as user types/selects
            if (e.target.classList.contains('input-error')) {
                e.target.classList.remove('input-error');
            }

            // Debounce the preview render so it doesn't lag while typing
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.renderLivePreview();
            }, 300);
        });
    },

    renderLivePreview() {
        // Only show preview if the minimum required fields for a chart are filled
        const project = document.getElementById('builder-project-select').value;
        if (!project) return; 

        document.getElementById('builder-preview-container').style.display = 'block';
        
        // Pass the current form data to your existing getStatsChartConfig function
        // ... (Render logic goes here, similar to your old showPreview function)
    },

    extractCardData() {
        const type = this.currentKpiType;
        const project = document.getElementById('builder-project-select').value;
        const title = document.getElementById('builder-title').value || `${type.charAt(0).toUpperCase() + type.slice(1)} KPI`;

        const baseData = {
            id: `kpi-card-${Date.now()}`,
            title,
            project,
            type
        };

        if (type === 'stats') {
            baseData.field = document.getElementById('builder-field-select').value;
            baseData.chartType = document.getElementById('builder-chart-type').value;
            baseData.cardSize = document.getElementById('builder-card-size').value || 'medium';
        } else if (type === 'value') {
            baseData.field = document.getElementById('builder-field-select').value;
            baseData.calcType = document.getElementById('builder-calc-type').value;
            baseData.displayType = document.getElementById('builder-display-type').value;
            baseData.cardSize = 'small';
        } else if (type === 'gantt') {
            baseData.startField = document.getElementById('builder-start-field').value;
            baseData.endField = document.getElementById('builder-end-field').value;
            baseData.cardSize = document.getElementById('builder-card-size').value || 'large';
        }

        return baseData;
    }
  },
  /**
   * Create Project Location/Map Card
   */
  createLocationCard() {
    const fields = [
      document.getElementById('location-project-select'),
      document.getElementById('location-lat-field'),
      document.getElementById('location-lon-field')
    ];

    if (!this.validateForm(fields)) return;

    const cardData = {
      project: document.getElementById('location-project-select').value,
      latField: document.getElementById('location-lat-field').value,
      lonField: document.getElementById('location-lon-field').value,
      photoField: document.getElementById('location-photo-field').value || null,
      type: 'map'
    };

    this.addCardToGrid(cardData);
    if (typeof showNotification === 'function') {
      showNotification('✓ Project location map card created successfully!', 'success');
    }
    this.closeModal('modal-add-project-location');
  },

  /**
   * Create Project Photo Card
   */
  createPhotoCard() {
    const sourceField = document.getElementById('photo-source-field').value;
    const photoUrl = document.getElementById('photo-url-input').value;
    const photoCaption = document.getElementById('photo-caption').value;
    const projectId = document.getElementById('photo-project-select').value;

    if (!sourceField && !photoUrl) {
      if (typeof showNotification === 'function') {
        showNotification('Please select a photo column or enter a URL', 'error');
      } else {
        alert('Please select a photo column or enter a URL');
      }
      return;
    }

    if (!projectId && !photoUrl) {
      if (typeof showNotification === 'function') {
        showNotification('Please select a project when using a photo column', 'error');
      } else {
        alert('Please select a project when using a photo column');
      }
      return;
    }

    const cardData = {
      id: `kpi-card-${Date.now()}`,
      project: projectId || null,
      sourceField: sourceField || null,
      url: photoUrl || null,
      caption: photoCaption || 'Project Photo',
      type: 'photo'
    };

    this.addCardToGrid(cardData);
    if (typeof showNotification === 'function') {
      showNotification('✓ Project photo card created successfully!', 'success');
    }
    this.closeModal('modal-add-project-photo');
  },

  /**
   * Add card to grid with proper positioning
   */
  getGridStack() {
    if (typeof window !== 'undefined' && window.gridStack) return window.gridStack;
    if (typeof GridStack !== 'undefined' && typeof GridStack.getGrids === 'function') {
      const grids = GridStack.getGrids();
      if (grids && grids.length > 0) return grids[0];
    }
    return null;
  },

  addCardToGrid(cardData, saveCard = true) {
    const grid = document.getElementById('summary-grid');
    if (!grid) return;

    const sizeMap = {
      'small': { w: 4, h: 6 },
      'medium': { w: 6, h: 8 },
      'large': { w: 8, h: 10 },
      'xlarge': { w: 12, h: 12 }
    };

    const size = sizeMap[cardData.cardSize] || { w: 4, h: 6 };
    cardData.id = cardData.id || `kpi-card-${Date.now()}`;
    const cardId = cardData.id;

    const cardContentHTML = `
      <div class="grid-stack-item-content summary-card" data-card-id="${cardId}">
        <div class="card-header">
          <h3>${cardData.title}</h3>
          <div class="card-actions">
            <button class="card-lock-btn" title="Lock this card" data-card-id="${cardId}">🔓</button>
            <button class="card-remove-btn" title="Remove this card" data-card-id="${cardId}">🗑</button>
          </div>
        </div>
        <div class="card-content">
          ${this.generateCardHTML(cardData)}
        </div>
      </div>
    `;

    const gridStack = this.getGridStack();
    if (!gridStack) {
      cardData._gridRetry = (cardData._gridRetry || 0) + 1;
      if (cardData._gridRetry <= 8) {
        this.log('GridStack not ready yet, retrying addCardToGrid for', cardData.id, cardData._gridRetry);
        setTimeout(() => this.addCardToGrid(cardData, saveCard), 110);
        return;
      }
      this.log('GridStack unavailable after retries, falling back to manual card insertion for', cardData.id);
    }

    if (gridStack && typeof gridStack.addWidget === 'function') {
      try {
        const addedItem = gridStack.addWidget({
          w: size.w,
          h: size.h,
          autoPosition: true,
          content: cardContentHTML
        });

        const cardElement = addedItem?.el || addedItem;
        if (cardElement) {
          this.setupCardActions(cardElement);
          if (cardData.type === 'stats') {
            setTimeout(() => this.renderStatsCard(cardData), 80);
          }
          if (cardData.type === 'value') {
            setTimeout(() => this.renderValueCard(cardData), 80);
          }
          if (cardData.type === 'gantt') {
            setTimeout(() => this.renderGanttCard(cardData), 80);
          }
          if (cardData.type === 'photo') {
            setTimeout(() => this.renderPhotoCard(cardData), 80);
          }
          if (cardData.type === 'map') {
            setTimeout(() => this.renderMapCard(cardData), 80);
          }
        }

        if (saveCard && !this.kpiCards.some(card => card.id === cardData.id)) {
          this.kpiCards.push(cardData);
          this.saveCards();
        }

        setTimeout(() => {
          if (typeof gridStack.compact === 'function') gridStack.compact();
          if (typeof gridStack.batchUpdate === 'function') gridStack.batchUpdate();
        }, 50);

        return;
      } catch (error) {
        console.warn('GridStack error when adding widget:', error);
      }
    }

    const gridItem = document.createElement('div');
    gridItem.className = 'grid-stack-item';
    gridItem.setAttribute('gs-w', size.w);
    gridItem.setAttribute('gs-h', size.h);
    gridItem.setAttribute('gs-auto-position', 'true');
    gridItem.innerHTML = cardContentHTML;
    grid.appendChild(gridItem);
    this.setupCardActions(gridItem);

    if (cardData.type === 'stats') {
      setTimeout(() => this.renderStatsCard(cardData), 80);
    }
    if (cardData.type === 'value') {
      setTimeout(() => this.renderValueCard(cardData), 80);
    }
    if (cardData.type === 'gantt') {
      setTimeout(() => this.renderGanttCard(cardData), 80);
    }
    if (cardData.type === 'photo') {
      setTimeout(() => this.renderPhotoCard(cardData), 80);
    }
    if (cardData.type === 'map') {
      setTimeout(() => this.renderMapCard(cardData), 80);
    }

    if (saveCard && !this.kpiCards.some(card => card.id === cardData.id)) {
      this.kpiCards.push(cardData);
      this.saveCards();
    }
  },

  /**
   * Generate card HTML based on type
   */
  generateCardHTML(cardData) {
    switch (cardData.type) {
      case 'stats':
        return `<div class="chart-container"><canvas id="canvas-${cardData.id}"></canvas></div>`;
      case 'value':
        return `
          <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; justify-content: flex-start;">
            <div class="kpi-value" id="value-display-${cardData.id}" style="font-size: 48px; font-weight: bold; color: var(--accent-blue); text-align: center; margin: 16px 0;">-</div>
            <div class="chart-container" style="min-height: 80px;">
              <canvas id="value-canvas-${cardData.id}"></canvas>
            </div>
          </div>
        `;
      case 'gantt':
        return `<div class="chart-container"><canvas id="gantt-canvas-${cardData.id}"></canvas></div>`;
      case 'map':
        return `<div class="map-wrapper"><div id="map-${cardData.id}"></div></div>`;
      case 'photo':
        return `<div id="photo-card-${cardData.id}" class="photo-card-container" style="height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 8px; box-sizing: border-box; background: var(--bg-tertiary); border-radius: 8px; overflow-y: auto;"></div>`;
      default:
        return `<div>Custom KPI Card</div>`;
    }
  },

  /**
   * Build stats chart configuration for Chart.js
   */
  getStatsChartConfig(cardData) {
    const typeMap = {
      donut: 'doughnut',
      area: 'line'
    };

    const chartType = typeMap[cardData.chartType] || cardData.chartType || 'bar';
    const rawRows = this.getProjectData(cardData.project) || [];

    const values = rawRows.map((row, index) => {
      const rawValue = row?.[cardData.field];
      const numeric = typeof rawValue === 'number'
        ? rawValue
        : parseFloat(String(rawValue).replace(/[^0-9.-]+/g, ''));
      return {
        label: row?.name || row?.task || `Row ${index + 1}`,
        raw: rawValue,
        numeric: Number.isFinite(numeric) ? numeric : null
      };
    });

    const numericValues = values.filter(item => item.numeric !== null);
    const isNumeric = numericValues.length >= Math.max(1, values.length * 0.6);

    const palette = [
      '#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'
    ];

    let labels = [];
    let data = [];
    let fill = chartType === 'area';

    if (isNumeric && ['bar', 'line', 'area', 'scatter'].includes(chartType)) {
      labels = values.map(item => item.label);
      if (chartType === 'scatter') {
        data = values.map((item, index) => ({ x: index + 1, y: item.numeric ?? 0 }));
      } else {
        data = values.map(item => item.numeric ?? 0);
      }
    } else {
      const categoryCounts = values.reduce((acc, item) => {
        const label = item.raw === undefined || item.raw === null || item.raw === '' ? 'Unknown' : String(item.raw);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      labels = Object.keys(categoryCounts);
      data = labels.map(label => categoryCounts[label]);
      fill = false;
    }

    if (!labels.length) {
      labels = ['No Data'];
      data = [1];
    }

    return {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: cardData.field || 'Data',
          data,
          backgroundColor: labels.map((_, index) => palette[index % palette.length]),
          borderColor: labels.map((_, index) => palette[index % palette.length]),
          borderWidth: 1,
          fill
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            enabled: true
          }
        },
        scales: chartType === 'scatter' ? {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Index' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: cardData.field || 'Value' }
          }
        } : {}
      }
    };
  },

  /**
   * Render stats chart after card insertion
   */
  renderStatsCard(cardData) {
    const canvasId = `canvas-${cardData.id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      this.log('Stats canvas not found for', canvasId);
      return;
    }

    const container = canvas.parentElement;
    const chartConfig = this.getStatsChartConfig(cardData);
    // NEW: Check if we hit the fallback "No Data" array from your config
    if (!chartConfig || chartConfig.data.labels[0] === 'No Data') {
        // Hide the canvas and show a clean empty state
        canvas.style.display = 'none';
        
        let emptyState = container.querySelector('.empty-state-msg');
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.className = 'empty-state-msg';
            emptyState.style.cssText = 'height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; font-weight: 500;';
            emptyState.textContent = 'No data available for this metric';
            container.appendChild(emptyState);
        }
        return;
    }
    // If we have data, ensure canvas is visible and render normally
    canvas.style.display = 'block';
    const existingEmptyState = container.querySelector('.empty-state-msg');
    if (existingEmptyState) existingEmptyState.remove();

    if (typeof Chart !== 'undefined') {
      if (canvas.chart) canvas.chart.destroy();
      canvas.chart = new Chart(canvas, chartConfig);
    }

    if (typeof renderChartFromData === 'function') {
      renderChartFromData(canvasId, chartConfig);
    } else if (typeof Chart !== 'undefined') {
      if (canvas.chart) canvas.chart.destroy();
      canvas.chart = new Chart(canvas, chartConfig);
    } else {
      this.log('Chart.js is not available to render stats card:', cardData);
    }
  },

  renderValueCard(cardData) {
    const cardElement = document.querySelector(`[data-card-id="${cardData.id}"]`);
    if (!cardElement) return;

    const value = this.calculateValueMetric(cardData);
    const formatted = this.formatValueMetric(value, cardData.displayType);
    const valueDisplay = cardElement.querySelector(`#value-display-${cardData.id}`);
    if (valueDisplay) {
      valueDisplay.textContent = formatted;
    }

    const canvasId = `value-canvas-${cardData.id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (canvas.chart) canvas.chart.destroy();

    const chartConfig = this.getValueChartConfig(cardData);
    if (chartConfig) {
      canvas.chart = new Chart(canvas, chartConfig);
    }
  },

  getValueChartConfig(cardData) {
    const rows = this.getProjectData(cardData.project) || [];
    const values = rows.map((row, index) => {
      const rawValue = row?.[cardData.field];
      const number = typeof rawValue === 'number'
        ? rawValue
        : parseFloat(String(rawValue).replace(/[^0-9.-]+/g, ''));
      return {
        label: row?.name || row?.task || `Row ${index + 1}`,
        numeric: Number.isFinite(number) ? number : null,
        raw: rawValue
      };
    });

    const numericValues = values.filter(item => item.numeric !== null);
    if (!numericValues.length) {
      const categoryCounts = values.reduce((acc, item) => {
        const label = item.raw === undefined || item.raw === null || item.raw === '' ? 'Unknown' : String(item.raw);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      const labels = Object.keys(categoryCounts);
      const data = labels.map(label => categoryCounts[label]);
      return {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Count',
            data,
            backgroundColor: labels.map((_, index) => `rgba(56, 189, 248, ${0.6 + (index % 4) * 0.1})`),
            borderColor: 'rgba(56, 189, 248, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { maxRotation: 45, minRotation: 0 } }, y: { beginAtZero: true } }
        }
      };
    }

    const labels = numericValues.map(item => item.label);
    const data = numericValues.map(item => item.numeric);
    return {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Trend',
          data,
          fill: false,
          borderColor: 'rgba(56, 189, 248, 1)',
          backgroundColor: 'rgba(56, 189, 248, 0.45)',
          tension: 0.35,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { beginAtZero: true } }
      }
    };
  },

  renderGanttCard(cardData) {
    const canvasId = `gantt-canvas-${cardData.id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      this.log('Gantt canvas not found for', canvasId);
      return;
    }

    const chartConfig = this.getGanttChartConfig(cardData);
    if (!chartConfig) {
      const cardElement = document.querySelector(`[data-card-id="${cardData.id}"]`);
      const content = cardElement?.querySelector('.card-content');
      if (content) {
        const rows = this.getProjectData(cardData.project);
        const dateValues = rows
          .map(row => ({
            start: new Date(row[cardData.startField]),
            end: new Date(row[cardData.endField])
          }))
          .filter(item => !isNaN(item.start.getTime()) && !isNaN(item.end.getTime()));
        if (!dateValues.length) {
          content.innerHTML = `<div style="display: flex; flex-direction: column; height: 100%; justify-content: center;"><div style="font-size: 12px; color: var(--text-muted);">No valid date ranges found for selected fields.</div></div>`;
        }
      }
      return;
    }

    if (typeof Chart === 'undefined') {
      this.log('Chart.js is not available to render gantt card:', cardData);
      return;
    }

    if (canvas.chart) canvas.chart.destroy();
    canvas.chart = new Chart(canvas, chartConfig);
  },

  renderPhotoCard(cardData) {
    const cardElement = document.querySelector(`[data-card-id="${cardData.id}"]`);
    if (!cardElement) {
      this.log('Photo card element not found for', cardData.id);
      return;
    }
    const container = cardElement.querySelector('.photo-card-container');
    if (!container) {
      this.log('Photo card container missing for', cardData.id);
      return;
    }

    const caption = this.sanitizePreviewText(cardData.caption || 'Project Photo');
    const photoUrl = cardData.url;
    const sourceField = cardData.sourceField;
    const rows = this.getProjectData(cardData.project);
    const imageUrls = [];

    if (photoUrl) {
      imageUrls.push(photoUrl);
    }

    if (sourceField) {
      rows.forEach(row => {
        const value = row?.[sourceField];
        if (value) {
          const normalized = typeof value === 'string' ? value.trim() : value;
          if (normalized) imageUrls.push(normalized);
        }
      });
    }

    const uniqueUrls = [...new Set(imageUrls)].slice(0, 6);

    if (!uniqueUrls.length) {
      container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">No photo data available for this project.</div>`;
      return;
    }

    const galleryHtml = uniqueUrls.map(url => `
      <div style="flex: 1 1 48%; min-width: 140px; height: 140px; overflow: hidden; border-radius: 10px; background: var(--bg-tertiary);">
        <img crossorigin="anonymous" loading="lazy" src="${this.sanitizePreviewText(url)}" alt="${caption}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
        <div style="font-size: 14px; font-weight: 700; color: var(--text-muted);">${caption}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; flex: 1; min-height: 180px;">
          ${galleryHtml}
        </div>
      </div>
    `;
  },

  renderMapCard(cardData) {
    const cardElement = document.querySelector(`[data-card-id="${cardData.id}"]`);
    if (!cardElement) {
      this.log('Map card element not found for', cardData.id);
      return;
    }

    const mapContainer = cardElement.querySelector(`#map-${cardData.id}`);
    if (!mapContainer) {
      this.log('Map container not found for', cardData.id);
      return;
    }

    if (typeof L === 'undefined') {
      mapContainer.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">Leaflet.js is not loaded. Map cannot be displayed.</div>`;
      return;
    }

    if (cardData._leafletMap) {
      cardData._leafletMap.remove();
      cardData._leafletMap = null;
    }

    const rows = this.getProjectData(cardData.project);
    const points = rows
      .map(row => {
        const lat = parseFloat(row?.[cardData.latField]);
        const lng = parseFloat(row?.[cardData.lonField]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          lat,
          lng,
          label: row?.name || row?.task || 'Location',
          progress: row?.progress || 0
        };
      })
      .filter(Boolean);

    if (!points.length) {
      mapContainer.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); padding: 12px; text-align: center;">No valid location coordinates were found for this project. Please select the correct latitude and longitude fields.</div>`;
      return;
    }

    mapContainer.innerHTML = '';
    const leafletMap = L.map(mapContainer).setView([points[0].lat, points[0].lng], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OSM',
        crossOrigin: 'anonymous'
    }).addTo(leafletMap);

    const markers = L.layerGroup().addTo(leafletMap);
    points.forEach(point => {
      const marker = L.marker([point.lat, point.lng]).addTo(markers);
      marker.bindPopup(`<strong>${this.sanitizePreviewText(point.label)}</strong><br>Progress: ${point.progress}%`);
    });

    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      leafletMap.fitBounds(bounds.pad(0.2));
    }

    cardData._leafletMap = leafletMap;
    
    // Ensure map displays correctly by invalidating size after render
    //setTimeout(() => {
   //   if (cardData._leafletMap) {
   //     cardData._leafletMap.invalidateSize(true);
   //   }
    //}, 100);
    // NEW: Add a ResizeObserver to perfectly sync the map with GridStack resizes
    if (typeof ResizeObserver !== 'undefined') {
        // Disconnect old observer if it exists
        if (cardData._resizeObserver) {
            cardData._resizeObserver.disconnect();
        }
        
        cardData._resizeObserver = new ResizeObserver(() => {
            // Use requestAnimationFrame to prevent "ResizeObserver loop limit exceeded" errors
            window.requestAnimationFrame(() => {
                if (cardData._leafletMap) {
                    cardData._leafletMap.invalidateSize();
                }
            });
        });
        
        cardData._resizeObserver.observe(mapContainer);
    }


  },

  getGanttChartConfig(cardData) {
    const rows = this.getProjectData(cardData.project);
    const validRows = rows
      .map((row, index) => {
        const start = new Date(row[cardData.startField]);
        const end = new Date(row[cardData.endField]);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        return {
          label: row?.name || row?.task || `Row ${index + 1}`,
          start,
          end,
          duration: Math.max(1, Math.round((end - start) / DAY))
        };
      })
      .filter(Boolean);

    if (!validRows.length) return null;

    const sorted = validRows.slice().sort((a, b) => a.start - b.start).slice(0, 12);
    const labels = sorted.map(item => item.label);
    const startDates = sorted.map(item => (item.start - sorted[0].start) / DAY);
    const durations = sorted.map(item => item.duration);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Offset',
            data: startDates,
            backgroundColor: 'rgba(0,0,0,0)',
            borderWidth: 0
          },
          {
            label: 'Duration',
            data: durations,
            backgroundColor: 'rgba(56, 189, 248, 0.8)',
            borderColor: 'rgba(56, 189, 248, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: context => {
                if (context.dataset.label === 'Duration') {
                  const row = sorted[context.dataIndex];
                  const start = row.start.toLocaleDateString();
                  const end = row.end.toLocaleDateString();
                  return `${row.label}: ${start} → ${end}`;
                }
                return null;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Days from start'
            }
          },
          y: {
            stacked: true,
            grid: {
              display: false
            }
          }
        }
      }
    };
  },

  calculateValueMetric(cardData) {
    const rows = this.getProjectData(cardData.project);
    if (!rows.length) return 0;

    const values = rows.map(row => {
      const rawValue = row?.[cardData.field];
      const number = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(/[^0-9.-]+/g, ''));
      return Number.isFinite(number) ? number : rawValue;
    });

    switch (cardData.calcType) {
      case 'sum':
        return values.reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      case 'average': {
        const numeric = values.filter(v => typeof v === 'number');
        return numeric.length ? numeric.reduce((sum, v) => sum + v, 0) / numeric.length : 0;
      }
      case 'min': {
        const numeric = values.filter(v => typeof v === 'number');
        return numeric.length ? Math.min(...numeric) : 0;
      }
      case 'max': {
        const numeric = values.filter(v => typeof v === 'number');
        return numeric.length ? Math.max(...numeric) : 0;
      }
      case 'percentage': {
        const truthy = values.filter(v => v && String(v).trim().length > 0).length;
        return rows.length ? (truthy / rows.length) * 100 : 0;
      }
      case 'count':
      default:
        return rows.length;
    }
  },

  formatValueMetric(value, displayType) {
    switch (displayType) {
      case 'percentage':
        return `${Number(value).toFixed(1)}%`;
      case 'currency':
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      case 'decimal':
        return Number(value).toFixed(2);
      default:
        return Number.isFinite(value) ? value.toLocaleString() : String(value);
    }
  },

  /**
   * Setup card action buttons
   */
  setupCardActions(cardElement) {
    const lockBtn = cardElement.querySelector('.card-lock-btn');
    const removeBtn = cardElement.querySelector('.card-remove-btn');

    if (lockBtn) {
      lockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        lockBtn.textContent = lockBtn.textContent === '🔓' ? '🔒' : '🔓';
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Remove this card?')) {
          const cardId = cardElement.dataset.cardId || cardElement.querySelector('[data-card-id]')?.dataset.cardId || removeBtn.dataset.cardId;
          cardElement.remove();
          if (cardId) {
            this.kpiCards = this.kpiCards.filter(card => card.id !== cardId);
            this.saveCards();
          }
          if (typeof showNotification === 'function') {
            showNotification('✓ Card removed', 'success');
          }
        }
      });
    }
  },

  ensureModalPreviewSection(modal) {
    if (!modal) return null;

    let previewSection = modal.querySelector('.kpi-preview-container');
    if (!previewSection) {
      previewSection = document.createElement('div');
      previewSection.className = 'kpi-preview-container';
      previewSection.style.display = 'none';
      previewSection.style.marginTop = '16px';
      previewSection.innerHTML = `
        <h4>Preview</h4>
        <div class="kpi-preview-box" data-preview-content></div>
      `;
      const body = modal.querySelector('.modal-body');
      if (body) {
        body.appendChild(previewSection);
      } else {
        modal.appendChild(previewSection);
      }
    }

    previewSection.style.display = 'block';
    return previewSection.querySelector('[data-preview-content]');
  },

  /**
   * Show preview
   */
  showPreview(modal) {
    if (!modal) return;
    const previewBox = this.ensureModalPreviewSection(modal);
    if (!previewBox) return;

    switch (modal.id) {
      case 'modal-create-stats-kpi':
        return this.renderStatsPreview(modal, previewBox);
      case 'modal-create-value-kpi':
        return this.renderValuePreview(modal, previewBox);
      case 'modal-create-gantt-kpi':
        return this.renderGanttPreview(modal, previewBox);
      case 'modal-add-project-location':
        return this.renderLocationPreview(modal, previewBox);
      case 'modal-add-project-photo':
        return this.renderPhotoPreview(modal, previewBox);
      default:
        previewBox.innerHTML = '<div>No preview available for this card type.</div>';
        return;
    }
  },

  renderStatsPreview(modal, previewBox) {
    const projectId = modal.querySelector('#stats-project-select')?.value;
    const field = modal.querySelector('#stats-field-select')?.value;
    const chartType = modal.querySelector('#stats-chart-type')?.value;
    const title = modal.querySelector('#stats-card-title')?.value || 'Stats KPI Preview';

    if (!projectId || !field) {
      previewBox.innerHTML = '<div>Please select a project and field to see the preview.</div>';
      return;
    }

    const cardData = {
      id: `preview-${modal.id}`,
      project: projectId,
      field,
      chartType,
      title
    };
    const chartConfig = this.getStatsChartConfig(cardData);
    const canvasId = `preview-canvas-${modal.id}`;

    previewBox.innerHTML = `
      <div style="position: relative; width: 100%; height: 240px;">
        <canvas id="${canvasId}" style="width: 100%; height: 100%;"></canvas>
      </div>
      <div class="kpi-preview-title">${this.sanitizePreviewText(title)}</div>
      <div class="kpi-preview-subtitle">${this.sanitizePreviewText(field)} • ${this.sanitizePreviewText(chartType)} chart</div>
    `;

    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (canvas.chart) canvas.chart.destroy();
    canvas.chart = new Chart(canvas, chartConfig);
  },

  renderValuePreview(modal, previewBox) {
    const projectId = modal.querySelector('#value-project-select')?.value;
    const field = modal.querySelector('#value-field-select')?.value;
    const calcType = modal.querySelector('#value-calc-type')?.value;
    const displayType = modal.querySelector('#value-display-type')?.value;
    const title = modal.querySelector('#value-card-title')?.value || 'Value KPI Preview';

    if (!projectId || !field) {
      previewBox.innerHTML = '<div>Please select a project and field to see the preview.</div>';
      return;
    }

    const cardData = { project: projectId, field, calcType, displayType, id: `preview-${modal.id}` };
    const value = this.calculateValueMetric(cardData);
    const formatted = this.formatValueMetric(value, displayType);
    const canvasId = `preview-value-canvas-${modal.id}`;
    const chartConfig = this.getValueChartConfig(cardData);

    previewBox.innerHTML = `
      <div style="position: relative; width: 100%; height: 150px; margin-bottom: 12px;">
        <canvas id="${canvasId}" style="width: 100%; height: 100%;"></canvas>
      </div>
      <div class="kpi-preview-value">${this.sanitizePreviewText(formatted)}</div>
      <div class="kpi-preview-title">${this.sanitizePreviewText(title)}</div>
      <div class="kpi-preview-subtitle">${this.sanitizePreviewText(calcType)} of ${this.sanitizePreviewText(field)}</div>
    `;

    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined' || !chartConfig) return;
    if (canvas.chart) canvas.chart.destroy();
    canvas.chart = new Chart(canvas, chartConfig);
  },

  renderGanttPreview(modal, previewBox) {
    const projectId = modal.querySelector('#gantt-project-select')?.value;
    const startField = modal.querySelector('#gantt-start-field')?.value;
    const endField = modal.querySelector('#gantt-end-field')?.value;
    const title = modal.querySelector('#gantt-card-title')?.value || 'Gantt KPI Preview';

    if (!projectId || !startField || !endField) {
      previewBox.innerHTML = '<div>Please select a project, start field, and end field to see the preview.</div>';
      return;
    }

    const rows = this.getProjectData(projectId);
    const dateValues = rows
      .map(row => ({
        start: new Date(row[startField]),
        end: new Date(row[endField])
      }))
      .filter(item => !isNaN(item.start.getTime()) && !isNaN(item.end.getTime()));

    if (!dateValues.length) {
      previewBox.innerHTML = `
        <div class="kpi-preview-title">${this.sanitizePreviewText(title)}</div>
        <div class="kpi-preview-subtitle">No valid date ranges available for these fields.</div>
      `;
      return;
    }

    const startDate = new Date(Math.min(...dateValues.map(item => item.start.getTime())));
    const endDate = new Date(Math.max(...dateValues.map(item => item.end.getTime())));

    previewBox.innerHTML = `
      <div class="kpi-preview-value">${dateValues.length} tasks</div>
      <div class="kpi-preview-title">${this.sanitizePreviewText(title)}</div>
      <div class="kpi-preview-subtitle">${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}</div>
    `;
  },

  renderLocationPreview(modal, previewBox) {
    const projectId = modal.querySelector('#location-project-select')?.value;
    const latField = modal.querySelector('#location-lat-field')?.value;
    const lonField = modal.querySelector('#location-lon-field')?.value;
    const photoField = modal.querySelector('#location-photo-field')?.value;

    if (!projectId || !latField || !lonField) {
      previewBox.innerHTML = '<div>Please select a project, latitude field, and longitude field to see the preview.</div>';
      return;
    }

    const rows = this.getProjectData(projectId);
    previewBox.innerHTML = `
      <div class="kpi-preview-title">Location Preview</div>
      <div class="kpi-preview-subtitle">${rows.length} rows available with ${this.sanitizePreviewText(latField)} / ${this.sanitizePreviewText(lonField)}</div>
      ${photoField ? `<div style="margin-top:10px; font-size: 12px; color: var(--text-muted);">Optional photo field: ${this.sanitizePreviewText(photoField)}</div>` : ''}
    `;
  },

  renderPhotoPreview(modal, previewBox) {
    const projectId = modal.querySelector('#photo-project-select')?.value;
    const sourceField = modal.querySelector('#photo-source-field')?.value;
    const photoUrl = modal.querySelector('#photo-url-input')?.value;
    const caption = modal.querySelector('#photo-caption')?.value || 'Project Photo Preview';

    if (!projectId && !photoUrl) {
      previewBox.innerHTML = '<div>Please select a project or enter a photo URL to see the preview.</div>';
      return;
    }

    previewBox.innerHTML = `
      <div class="kpi-preview-title">${this.sanitizePreviewText(caption)}</div>
      <div class="kpi-preview-subtitle">${photoUrl ? 'Using custom URL' : `Using field ${this.sanitizePreviewText(sourceField)}`}</div>
      ${photoUrl ? `<img src="${this.sanitizePreviewText(photoUrl)}" alt="Preview" style="max-width:100%; margin-top:12px; border-radius:8px;" />` : ''}
    `;
  },

  sanitizePreviewText(text) {
    return String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

// Initialize modals when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => KPIModals.init(), 500);
  });
} else {
  setTimeout(() => KPIModals.init(), 500);
}
