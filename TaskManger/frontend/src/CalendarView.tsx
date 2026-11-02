import { useMemo, memo } from "react";
import { shiftDue } from "./dates";
import FullCalendar from "@fullcalendar/react";
import dayGrid from "@fullcalendar/daygrid";
import timeGrid from "@fullcalendar/timegrid";
import list from "@fullcalendar/list";
import interaction from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import arLocale from "@fullcalendar/core/locales/ar";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mui/material";
import type { Task, User, Category } from "./types";
function CalendarView({
  tasks,
  user,
  categories,
  setEditor,
  patch,
}: {
  tasks: Task[];
  user: User;
  categories: Category[];
  setEditor: (value: { task?: Task; initial?: Partial<Task> }) => void;
  patch: (task: Task, data: Partial<Task>) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const rtl = i18n.language === "ar";
  const mobile = useMediaQuery("(max-width:700px)");
  const events = useMemo(
    () =>
      tasks
        .filter((x) => x.date || x.start || x.due)
        .map((x) => ({
          id: String(x.id),
          title: x.title,
          start: x.all_day ? x.date! : x.start || x.due!,
          end: x.all_day ? x.end_date || undefined : x.end || undefined,
          allDay: x.all_day,
          backgroundColor:
            categories.find((c) => c.id === x.category)?.color || "#7566d9",
          borderColor: "transparent",
        })),
    [tasks, categories],
  );
  return (
    <div className="calendar-panel">
      <FullCalendar
        key={`${i18n.language}-${mobile}`}
        plugins={[dayGrid, timeGrid, list, interaction, luxonPlugin]}
        initialView={mobile ? "listWeek" : "dayGridMonth"}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: mobile
            ? "listWeek,dayGridMonth"
            : "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
        }}
        locale={rtl ? arLocale : "en"}
        direction={rtl ? "rtl" : "ltr"}
        timeZone={user.timezone}
        height="auto"
        editable
        selectable
        events={events}
        dateClick={(info) =>
          setEditor({
            initial: info.allDay
              ? { all_day: true, date: info.dateStr }
              : { start: info.date.toISOString() },
          })
        }
        select={(info) =>
          setEditor({
            initial: info.allDay
              ? {
                  all_day: true,
                  date: info.startStr,
                  end_date: info.endStr,
                }
              : {
                  start: info.start.toISOString(),
                  end: info.end.toISOString(),
                },
          })
        }
        eventClick={(info) =>
          setEditor({
            task: tasks.find((x) => String(x.id) === info.event.id),
          })
        }
        eventDrop={async (info) => {
          const task = tasks.find((x) => String(x.id) === info.event.id)!;
          try {
            await patch(
              task,
              info.event.allDay
                ? {
                    all_day: true,
                    date: info.event.startStr.slice(0, 10),
                    end_date: info.event.endStr
                      ? info.event.endStr.slice(0, 10)
                      : null,
                  }
                : {
                    all_day: false,
                    start: info.event.start?.toISOString(),
                    end: info.event.end?.toISOString() || null,
                    ...(task.due
                      ? { due: shiftDue(task.due, task.timezone, info.delta) }
                      : {}),
                  },
            );
          } catch {
            info.revert();
          }
        }}
        eventResize={async (info) => {
          const task = tasks.find((x) => String(x.id) === info.event.id)!;
          try {
            await patch(
              task,
              info.event.allDay
                ? { end_date: info.event.endStr.slice(0, 10) }
                : { end: info.event.end?.toISOString() },
            );
          } catch {
            info.revert();
          }
        }}
      />
    </div>
  );
}

export default memo(CalendarView);
