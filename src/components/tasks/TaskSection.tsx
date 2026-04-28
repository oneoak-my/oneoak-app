'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, ChevronDown, ChevronUp, Plus, Loader2 } from 'lucide-react'
import { getTasks, createTask, updateTask, deleteTask, createDefaultTasks } from '@/lib/api'
import type { PropertyRecord, Task, TaskCategory, TaskStatus } from '@/lib/types'
import { OPTIONAL_TASK_LISTS } from '@/lib/taskTemplates'
import type { OptionalTaskList } from '@/lib/taskTemplates'

const STATUS_CYCLE: TaskStatus[] = ['Open', 'In Progress', 'Completed']

const STATUS_PILL: Record<TaskStatus, string> = {
  'Open':        'bg-[#332c20] text-[#a89d84] border-[#3d3628]',
  'In Progress': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Completed':   'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  'Open':        'Open',
  'In Progress': 'In Progress',
  'Completed':   'Done',
}

export default function TaskSection({ record }: { record: PropertyRecord }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [othersText, setOthersText] = useState<Record<string, string>>({})

  // Bug 1 fix: auto-seed defaults when a record has no tasks yet, and log
  // every step so failures in Supabase are visible in the browser console.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      let data = await getTasks(record.id)
      console.log(`[TaskSection] Loaded ${data.length} tasks for record ${record.id}`)

      if (data.length === 0) {
        // Record pre-dates the task system (or createDefaultTasks failed on
        // creation). Seed defaults now, then re-fetch.
        console.log(`[TaskSection] No tasks found — seeding defaults for type="${record.type}"`)
        await createDefaultTasks(record.id, record.type)
        data = await getTasks(record.id)
        console.log(`[TaskSection] After seeding: ${data.length} tasks`)
      }

      setTasks(data)
    } catch (e) {
      console.error('[TaskSection] load error:', e)
    } finally {
      setLoading(false)
    }
  }, [record.id, record.type])   // Bug 1 fix: record.type was missing from deps

  useEffect(() => { load() }, [load])

  const defaultTasks  = tasks.filter((t) => !t.is_optional)
  const optionalTasks = tasks.filter((t) => t.is_optional)
  const completedCount = tasks.filter((t) => t.status === 'Completed').length
  const progress = tasks.length > 0 ? completedCount / tasks.length : 0
  const addedTitles = new Set(optionalTasks.map((t) => t.title))
  const optionalLists = OPTIONAL_TASK_LISTS[record.type] ?? []

  // Cycle status with optimistic update + revert on error
  async function cycleStatus(task: Task) {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t))
    await updateTask(task.id, { status: next }).catch((e) => {
      console.error('[TaskSection] cycleStatus error:', e)
      load()
    })
  }

  // Bug 2 fix: log every step so we can see exactly what createTask receives
  // and what Supabase returns.
  async function addOptional(category: TaskCategory, title: string) {
    console.log(`[TaskSection] addOptional called: category=${category}, title="${title}", record_id=${record.id}`)
    try {
      const payload = {
        record_id: record.id,
        category,
        title,
        is_optional: true,
        status: 'Open' as TaskStatus,
        sort_order: 100 + optionalTasks.length,
        due_date: null,
        notes: null,
      }
      console.log('[TaskSection] createTask payload:', payload)
      const created = await createTask(payload)
      console.log('[TaskSection] createTask success:', created.id)
      setTasks((prev) => [...prev, created])
    } catch (e) {
      console.error('[TaskSection] createTask error:', e)
    }
  }

  async function removeOptional(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    await deleteTask(taskId).catch((e) => {
      console.error('[TaskSection] deleteTask error:', e)
      load()
    })
  }

  async function addOthers(category: TaskCategory, key: string) {
    const title = (othersText[key] ?? '').trim()
    if (!title) return
    setOthersText((prev) => ({ ...prev, [key]: '' }))
    await addOptional(category, title)
  }

  function toggleCat(cat: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-[#1e1a14] border border-[#332c20] animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">Tasks</p>
        <span className="text-xs text-[#5c5040]">{completedCount}/{tasks.length} done</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#332c20] rounded-full overflow-hidden">
        <div
          className="h-full bg-gold-500 rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Active task list */}
      {tasks.length > 0 && (
        <div className="rounded-2xl border border-[#332c20] overflow-hidden">
          {/* Default tasks */}
          {defaultTasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              onCycle={cycleStatus}
              showDivider={i < defaultTasks.length - 1 || optionalTasks.length > 0}
            />
          ))}

          {/* Optional tasks with section label */}
          {optionalTasks.length > 0 && (
            <>
              {defaultTasks.length > 0 && (
                <div className="px-4 py-2 bg-[#181410] border-t border-[#332c20]">
                  <p className="text-[10px] text-[#4a4030] uppercase tracking-widest font-medium">Added</p>
                </div>
              )}
              {optionalTasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onCycle={cycleStatus}
                  onDelete={() => removeOptional(task.id)}
                  showDivider={i < optionalTasks.length - 1}
                />
              ))}
            </>
          )}
        </div>
      )}

      {tasks.length === 0 && (
        <p className="text-sm text-center text-[#5c5040] py-2">No tasks yet.</p>
      )}

      {/* Add Tasks section */}
      {optionalLists.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-[#4a4030] uppercase tracking-widest font-medium mb-2">Add Tasks</p>
          {optionalLists.map((optList) => (
            <OptionalCategory
              key={optList.category}
              optList={optList}
              addedTitles={addedTitles}
              expanded={expandedCats.has(optList.category)}
              onToggle={() => toggleCat(optList.category)}
              onAdd={(title) => addOptional(optList.category, title)}
              othersText={othersText[optList.category] ?? ''}
              onOthersChange={(v) => setOthersText((prev) => ({ ...prev, [optList.category]: v }))}
              onOthersSubmit={() => addOthers(optList.category, optList.category)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onCycle,
  onDelete,
  showDivider,
}: {
  task: Task
  onCycle: (t: Task) => void
  onDelete?: () => void
  showDivider: boolean
}) {
  const isDone = task.status === 'Completed'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 bg-[#1e1a14] ${showDivider ? 'border-b border-[#332c20]' : ''}`}>
      {/* Status pill — tap to cycle */}
      <button
        onClick={() => onCycle(task)}
        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all active:scale-95 ${STATUS_PILL[task.status]}`}
      >
        {STATUS_LABEL[task.status]}
      </button>

      {/* Title */}
      <span className={`flex-1 text-sm leading-snug ${isDone ? 'line-through text-[#4a4030]' : 'text-[#f5f0e8]'}`}>
        {task.title}
      </span>

      {/* Delete (optional tasks only) */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 p-1.5 text-[#4a4030] hover:text-red-400 transition-colors active:scale-90"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

// ── Optional category ─────────────────────────────────────────────────────────

function OptionalCategory({
  optList,
  addedTitles,
  expanded,
  onToggle,
  onAdd,
  othersText,
  onOthersChange,
  onOthersSubmit,
}: {
  optList: OptionalTaskList
  addedTitles: Set<string>
  expanded: boolean
  onToggle: () => void
  onAdd: (title: string) => void
  othersText: string
  onOthersChange: (v: string) => void
  onOthersSubmit: () => void
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const addedCount = optList.items.filter((i) => i !== 'Others' && addedTitles.has(i)).length

  async function handleAdd(title: string) {
    console.log(`Add button clicked for ${title}`)
    if (adding) return
    setAdding(title)
    try {
      await onAdd(title)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="rounded-xl border border-[#332c20] overflow-hidden">
      {/* Category header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#181410] hover:bg-[#1e1a14] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#7c6f54] uppercase tracking-wider">
            {optList.label}
          </span>
          {addedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-400 font-medium">
              {addedCount}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp size={14} className="text-[#5c5040]" />
          : <ChevronDown size={14} className="text-[#5c5040]" />
        }
      </button>

      {/* Items */}
      {expanded && (
        <div className="divide-y divide-[#332c20]/50 bg-[#141210]">
          {optList.items.filter((i) => i !== 'Others').map((item) => {
            const isAdded = addedTitles.has(item)
            const isLoading = adding === item

            return (
              <div key={item} className="flex items-center justify-between px-4 py-2.5">
                <span className={`text-sm ${isAdded ? 'text-[#5c5040]' : 'text-[#a89d84]'}`}>
                  {item}
                </span>
                {isAdded ? (
                  <span className="text-[11px] text-emerald-500 font-medium">✓ Added</span>
                ) : isLoading ? (
                  <Loader2 size={13} className="text-gold-400 animate-spin" />
                ) : (
                  <button
                    onClick={() => handleAdd(item)}
                    className="flex items-center gap-1 text-[11px] text-gold-400 font-semibold hover:text-gold-300 transition-colors active:scale-95"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                )}
              </div>
            )
          })}

          {/* Others free text */}
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="text-sm text-[#5c5040]">Others:</span>
            <input
              value={othersText}
              onChange={(e) => onOthersChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOthersSubmit() } }}
              placeholder="Type task name…"
              className="flex-1 bg-transparent text-sm text-[#f5f0e8] placeholder-[#4a4030] outline-none"
            />
            {othersText.trim() && (
              <button
                onClick={onOthersSubmit}
                className="shrink-0 text-[11px] text-gold-400 font-semibold hover:text-gold-300 transition-colors"
              >
                Add
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
