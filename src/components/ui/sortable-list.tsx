import * as React from "react"
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (orderedIds: string[]) => void
  renderItem: (item: T, handle: SortableHandleProps) => React.ReactNode
  /** Render as a <tbody> instead of a <div> (useful inside a <table>) */
  asTbody?: boolean
  className?: string
}

export interface SortableHandleProps {
  attributes: React.HTMLAttributes<HTMLElement>
  listeners: React.HTMLAttributes<HTMLElement> | undefined
  isDragging: boolean
  setActivatorNodeRef: (el: HTMLElement | null) => void
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  asTbody,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(items, oldIndex, newIndex)
    onReorder(next.map((i) => i.id))
  }

  const Wrapper: any = asTbody ? "tbody" : "div"

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <Wrapper className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </Wrapper>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  id,
  children,
}: {
  id: string
  children: (handle: SortableHandleProps) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  }

  return (
    <SortableSlot ref={setNodeRef as any} style={style}>
      {children({
        attributes: attributes as any,
        listeners: listeners as any,
        isDragging,
        setActivatorNodeRef: setActivatorNodeRef as any,
      })}
    </SortableSlot>
  )
}

// SortableSlot just forwards ref+style to the first child (which the caller renders)
const SortableSlot = React.forwardRef<HTMLElement, { children: React.ReactNode; style: React.CSSProperties }>(
  ({ children, style }, ref) => {
    const child = React.Children.only(children) as React.ReactElement<any>
    return React.cloneElement(child, {
      ref,
      style: { ...(child.props.style || {}), ...style },
    })
  }
)
SortableSlot.displayName = "SortableSlot"
