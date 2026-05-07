# KPI System - Implementation Guide

## Quick Start

### 1. File Organization
All KPI functionality is organized into modular, reusable files:

```
index.html       → HTML markup including modal templates
styles.css       → All CSS for KPI header, modals, and responsiveness
kpi-modals.js    → JavaScript controller for modal system
script.js        → Existing app logic (unchanged)
```

### 2. Initializing the System

The KPI system auto-initializes when the page loads:

```javascript
// Automatically called on DOM ready
KPIModals.init()
```

### 3. Modal Lifecycle

#### Opening a Modal
```javascript
KPIModals.openModal('modal-create-stats-kpi');
```

#### Closing a Modal
```javascript
KPIModals.closeModal('modal-create-stats-kpi');
```

#### Creating a Card
```javascript
// Triggered by Create button in modal
KPIModals.createStatsCard();
// Validates → Creates data object → Adds to grid → Shows notification
```

---

## Customization Examples

### Example 1: Add a New Project

Modify `kpi-modals.js` line ~55 in the `loadProjects()` method:

```javascript
loadProjects() {
  this.projects = [
    { id: 1, name: 'Project Alpha' },
    { id: 2, name: 'Project Beta' },
    { id: 3, name: 'New Project' }  // Add here
  ];
  
  // Add fields for the new project
  this.projectFields[3] = ['Field1', 'Field2', 'Field3'];
}
```

### Example 2: Add a New Chart Type

Modify `index.html` in the stats-chart-type select:

```html
<select id="stats-chart-type" class="form-control">
  <option value="bar">Bar Chart</option>
  <option value="line">Line Chart</option>
  <option value="bubble">Bubble Chart</option>  <!-- Add new -->
</select>
```

Then update `generateCardHTML()` in `kpi-modals.js`:

```javascript
generateCardHTML(cardData) {
  switch (cardData.type) {
    case 'stats':
      // Handle bubble chart
      if (cardData.chartType === 'bubble') {
        return `<canvas id="canvas-bubble-${Date.now()}"></canvas>`;
      }
      return `<canvas id="canvas-${cardData.id || Date.now()}"></canvas>`;
    // ... other cases
  }
}
```

### Example 3: Add Calculation Type

Modify `index.html` value-calc-type select:

```html
<select id="value-calc-type" class="form-control">
  <option value="sum">Sum</option>
  <option value="median">Median</option>  <!-- Add new -->
  <option value="variance">Variance</option>  <!-- Add new -->
</select>
```

### Example 4: Connect to Backend Data

Replace the `loadProjects()` method with API call:

```javascript
async loadProjects() {
  try {
    const response = await fetch('/api/projects');
    const data = await response.json();
    
    this.projects = data.projects;  // Expect [{id, name}, ...]
    this.projectFields = data.fields;  // Expect {1: [...], 2: [...]}
  } catch (error) {
    console.error('Failed to load projects:', error);
    this.loadProjects(); // Fallback to defaults
  }
}
```

### Example 5: Persist Cards to Backend

Add to `addCardToGrid()` method after adding card to grid:

```javascript
addCardToGrid(cardData) {
  // ... existing code ...
  
  // Save to backend
  this.saveCardToBackend(cardData);
}

saveCardToBackend(cardData) {
  fetch('/api/kpi-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cardData)
  })
  .then(r => r.json())
  .then(data => console.log('Saved:', data))
  .catch(err => console.error('Error:', err));
}
```

---

## Advanced Customization

### Custom Validation

Add method to `KPIModals` object:

```javascript
validateStatsCard(formFields) {
  // Custom validation logic
  const title = formFields[0].value;
  if (title.length < 3) {
    throw new Error('Title must be at least 3 characters');
  }
  
  return true;
}
```

Then call in `createStatsCard()`:

```javascript
createStatsCard() {
  try {
    this.validateStatsCard(fields);
    // ... rest of method
  } catch (error) {
    showNotification(error.message, 'error');
  }
}
```

### Custom Card Rendering

Create renderer functions:

```javascript
renderStatsCard(canvas, data) {
  const ctx = canvas.getContext('2d');
  // Custom Chart.js configuration
  new Chart(ctx, {
    type: data.chartType,
    data: { /* ... */ },
    options: { /* ... */ }
  });
}

// Call in addCardToGrid() after canvas element is added
if (cardData.type === 'stats') {
  setTimeout(() => {
    const canvas = document.getElementById(`canvas-${cardData.id}`);
    if (canvas) this.renderStatsCard(canvas, cardData);
  }, 100);
}
```

### Field Validation Rules

Add validation class:

```javascript
const FieldRules = {
  title: {
    required: true,
    minLength: 2,
    maxLength: 50
  },
  cardSize: {
    required: true,
    enum: ['small', 'medium', 'large', 'xlarge']
  },
  project: {
    required: true,
    type: 'number'
  }
};

validateField(fieldName, value) {
  const rules = FieldRules[fieldName];
  if (!rules) return true;
  
  if (rules.required && !value) {
    throw new Error(`${fieldName} is required`);
  }
  
  if (rules.minLength && value.length < rules.minLength) {
    throw new Error(`${fieldName} too short`);
  }
  
  return true;
}
```

---

## API Examples

### Connect to Express Backend

In `server.js`:

```javascript
app.get('/api/projects', (req, res) => {
  res.json({
    projects: [
      { id: 1, name: 'Project A' },
      { id: 2, name: 'Project B' }
    ],
    fields: {
      1: ['Name', 'Status', 'Progress'],
      2: ['Title', 'Phase', 'Duration']
    }
  });
});

app.post('/api/kpi-cards', (req, res) => {
  const cardData = req.body;
  // Save to database
  res.json({ success: true, cardId: 123 });
});

app.delete('/api/kpi-cards/:id', (req, res) => {
  // Delete from database
  res.json({ success: true });
});
```

### Fetch Data from External API

```javascript
async loadProjects() {
  try {
    const response = await fetch('https://api.example.com/projects');
    const data = await response.json();
    this.projects = data;
  } catch (error) {
    showNotification('Failed to load projects', 'error');
  }
}
```

---

## Styling Customization

### Change Color Scheme

Modify CSS custom properties in `styles.css`:

```css
:root {
  --accent-orange: #ff6b35;      /* Changes all action buttons */
  --accent-purple: #c44569;      /* Changes preview button */
  --accent-blue: #4ecdc4;        /* Changes primary accent */
}
```

### Custom Modal Width

Update modal-md and modal-lg:

```css
.modal-md {
  width: 90%;
  max-width: 600px;  /* Increase from 500px */
}

.modal-lg {
  width: 90%;
  max-width: 900px;  /* Increase from 700px */
}
```

### Change Button Styles

```css
.kpi-action-btn {
  border-radius: 12px;        /* More rounded */
  padding: 12px 18px;         /* Larger padding */
  font-weight: 700;           /* Bolder text */
  text-transform: uppercase;  /* All caps */
}
```

---

## Testing Checklist

- [ ] Modal opens on button click
- [ ] Form fields populate correctly
- [ ] Validation shows error for empty fields
- [ ] Create button saves card
- [ ] Card appears in grid
- [ ] Lock button toggles
- [ ] Remove button deletes card
- [ ] Close button closes modal
- [ ] ESC key closes modal
- [ ] Overlay click closes modal
- [ ] Responsive layout on mobile
- [ ] All notification messages appear

---

## Debugging Tips

### Enable Debug Logging

Add to top of `kpi-modals.js`:

```javascript
const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) console.log('[KPI]', ...args);
}
```

Then use throughout:

```javascript
debugLog('Modal opened:', modalId);
debugLog('Card data:', cardData);
debugLog('Grid updated with', gridItem);
```

### Check Modal State

In browser console:

```javascript
// Check if modal is visible
document.getElementById('modal-create-stats-kpi').classList.contains('hidden')

// Check GridStack
GridStack.getGrids()

// Check KPIModals object
console.log(KPIModals)

// Check projects loaded
console.log(KPIModals.projects)
```

### Performance Monitoring

```javascript
addCardToGrid(cardData) {
  console.time('Add Card');
  // ... method code ...
  console.timeEnd('Add Card');
}
```

---

## Common Issues & Solutions

### Issue: Modals not appearing
**Solution:** Verify `kpi-modals.js` is loaded after DOM ready

### Issue: Fields not populating
**Solution:** Check `projectFields` object has data for selected project

### Issue: Cards not responsive
**Solution:** Verify GridStack CSS is loaded before custom styles

### Issue: Buttons not clickable
**Solution:** Check z-index values, ensure overlay not capturing clicks

---

## Next Steps

1. Replace `loadProjects()` with your actual data source
2. Add backend endpoints for saving/loading cards
3. Implement real data calculations for value KPIs
4. Connect Chart.js with actual project data
5. Add Leaflet markers for location cards
6. Implement photo gallery functionality

