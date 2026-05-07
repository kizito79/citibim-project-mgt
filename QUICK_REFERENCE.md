# Quick Reference: New KPI Dashboard Features

## 🎯 Quick Start Examples

### 1. Creating a Completion Rate KPI
```
1. Click "➕ Create KPI" button
2. Card Title: "Completion Rate"
3. Data Source: "Tasks Data"
4. Calculation Type: "Percentage"
5. Column: (auto-selected)
6. Filter: "Completed Only"
7. Size: "Medium (1/2 width)"
8. Click "✓ Create Card"
```

### 2. Creating an Average Progress KPI
```
1. Click "➕ Create KPI"
2. Card Title: "Average Task Progress"
3. Data Source: "Tasks Data"
4. Calculation Type: "Average"
5. Column: "Progress"
6. Filter: "Active Only"
7. Size: "Small (1/3 width)"
8. Click "✓ Create Card"
```

### 3. Creating a Task Count KPI
```
1. Click "➕ Create KPI"
2. Card Title: "Total Active Tasks"
3. Data Source: "Tasks Data"
4. Calculation Type: "Count"
5. Filter: "Active Only"
6. Size: "Full Width"
7. Click "✓ Create Card"
```

---

## 🔧 Common Tasks

### Remove a KPI Card
```
1. Locate the card you want to remove
2. Click the trash icon (🗑) in card header
3. Click OK in confirmation dialog
4. Card is removed
```

### Lock a Card (Prevent Accidental Movement)
```
1. Click lock icon (🔓) on card header
2. Icon changes to 🔒
3. Card cannot be moved
4. Click again to unlock
```

### Edit Dashboard Title
```
Option A:
1. Click on "Project Summary" text
2. Enter new title: e.g., "Q1 2026 Dashboard"
3. Click OK

Option B:
1. Click edit button (✎) next to title
2. Enter new title
3. Click OK
```

### Preview KPI Before Creating
```
1. Fill in KPI form fields
2. Click "👁 Preview" button
3. View the calculated value
4. Adjust configuration if needed
5. Click "✓ Create Card" when satisfied
```

---

## 📊 Available Calculations

| Calculation | Description | Example |
|---|---|---|
| **Count** | Number of items in category | "10 active tasks" |
| **Sum** | Total of numeric values | "2,500 hours total" |
| **Average** | Mean value | "65% average progress" |
| **Max** | Highest value | "30 days (longest task)" |
| **Min** | Lowest value | "1 day (shortest task)" |
| **Percentage** | Percentage of total | "45% tasks completed" |

---

## 🎨 Card Sizes

| Size | Width | Best For |
|---|---|---|
| **Small** | 1/3 of dashboard | Quick metrics, status icons |
| **Medium** | 1/2 of dashboard | Standard KPI cards (default) |
| **Large** | 2/3 of dashboard | Important metrics, charts |
| **Full Width** | Entire width | Summary tables, wide charts |

---

## 🔐 Data Filtering Options

### Filter Types Available

**For Completed Only:**
- Shows only tasks with 100% progress
- Use case: "Tasks we've finished"

**For Active Only:**
- Shows tasks between 0-99% progress
- Use case: "Work in progress"

**For Overdue Only:**
- Shows incomplete tasks past end date
- Use case: "Tasks needing attention"

### Creating a Complex KPI with Filters

Example: "Percentage of overdue tasks that are active"
```
1. Title: "Active Overdue Tasks %"
2. Calculation: "Percentage"
3. Filter: "Overdue Only" (combined with active status)
4. Result: Shows % of active tasks that are overdue
```

---

## 💾 Data Persistence

### Automatic Saving
- All changes save automatically
- No manual save required
- Data stored in:
  - **Browser localStorage** (backup)
  - **Backend database** (primary)

### Your KPI Settings Are Saved
- Card titles
- Calculation types
- Filters applied
- Card sizes and positions
- Lock states

### Recovery
- Data persists across browser sessions
- Close browser and reopen - data stays
- Clear cache? (Data recovers from backend)

---

## ⚠️ Protected/Core Cards

These cards **cannot be removed**:
- ⚡ **Total Tasks** - Core metric
- ⚡ **Average Progress %** - Core metric
- ⚡ **Task Status Distribution** - Core chart
- ⚡ **Project Sites Map** - Location data

**Why?** These provide essential dashboard context.

**Custom KPIs** (the ones you create) can be freely removed.

---

## 🎯 Tips & Tricks

### Making the Most of Your Dashboard

1. **Pin Important Cards**
   - Lock high-priority KPIs using the 🔒 button
   - Prevents accidental repositioning

2. **Organize by Priority**
   - Place most-used KPIs in top-left
   - Use Full Width cards for key metrics

3. **Use Meaningful Titles**
   - "Completion Rate" (✓ Clear)
   - "% Done" (✗ Vague)
   - "Budget vs Actual" (✓ Clear)

4. **Combine Multiple Metrics**
   - Create several small cards
   - Tell a complete story about project status

5. **Update Regularly**
   - Add new KPIs as needs change
   - Remove outdated metrics
   - Dashboard evolves with project

### Performance Tips

- Limit to 15-20 KPI cards
- Remove cards you don't actively monitor
- Use larger filters to reduce data processing

---

## 🔄 Demo Scenario

### Setting Up a Project Dashboard

**Step 1: Customize Title**
```
Click "Project Summary" → "Q2 Construction Project Dashboard"
```

**Step 2: Create Team Metrics**
```
Create KPI: "Team Capacity Usage"
- Calculation: Percentage
- Filter: Active Only
```

**Step 3: Create Progress Tracking**
```
Create KPI: "on-time Delivery Rate"
- Calculation: Percentage
- Filter: Completed Only
```

**Step 4: Create Resource Metrics**
```
Create KPI: "Average Task Duration"
- Calculation: Average
```

**Step 5: Secure Dashboard**
```
Lock important KPIs using 🔒 button
```

**Step 6: Save**
```
Press Ctrl+S or click 💾 Save button
```

---

## 🚀 Advanced Usage

### Creating a "Red Flag" Dashboard

**Setup:**
1. Title: "Project Health Dashboard"
2. Add KPI: "Overdue Tasks Count"
3. Add KPI: "Below Target Progress %"
4. Add KPI: "Unassigned Tasks"
5. Lock all cards

**Result:** Quick view of critical issues

### Creating an Executive Summary

**Setup:**
1. Title: "Executive Summary - Q2 2026"
2. Large card: "Overall Completion %"
3. Medium card: "Tasks Complete"
4. Medium card: "Team Efficiency"
5. Full width: "Timeline Chart"

**Result:** Perfect for stakeholder reports

### Creating a Daily Standup Board

**Setup:**
1. Small card: "Today's Completions"
2. Small card: "Blockers/Issues"
3. Small card: "New Tasks"
4. Full width: "Team Workload"

**Result:** Quick 5-minute team sync view

---

## ❓ FAQ

**Q: Can I make the title longer?**
A: Yes, up to 500 characters. Titles longer than ~50 chars will wrap nicely.

**Q: What happens if I remove a card by mistake?**
A: Refresh the page and reload from backup. It's saved in localStorage.

**Q: Can I duplicate a KPI card?**
A: Create a new one with same settings. In future versions, we'll add "Duplicate Card" feature.

**Q: Do cards update in real-time?**
A: KPIs recalculate when tasks change. Refresh page to see latest data.

**Q: Can I export the dashboard?**
A: Use "Export" button in top bar for data. Screenshots work for visual saved versions.

**Q: Is my data backed up?**
A: Yes! Data is saved locally AND on the backend server.

---

## 📞 Support

### Report Issues
- Check FEATURES_ADDED.md for detailed documentation
- Review browser console for error messages
- Verify task data is valid

### Feature Requests
- Suggest new calculation types
- Request additional filtering options
- Propose new card display types

---

## 🎓 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+S | Save all changes |
| Ctrl+E | Export data |
| Ctrl+I | Import data |
| Esc | Close modal dialogs |

---

**Last Updated:** April 27, 2026  
**Version:** 1.0  
**Status:** Ready for Production ✓
