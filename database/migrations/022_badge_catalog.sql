CREATE TABLE badge_catalog (
  position integer NOT NULL UNIQUE,
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('Process','Streaks','Review','Community')),
  name text NOT NULL,
  description text NOT NULL,
  steps text[] NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  unit text NOT NULL,
  icon_path text NOT NULL
);

INSERT INTO badge_catalog VALUES
(1,'nine-clean-days','Process','Nine clean days','Nine days in a row with every rule on your list followed.',ARRAY['Follow every rule on the trade check, every trading day.','A day with no trades does not break the run.'],9,'days','M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5L16 9'),
(2,'stop-in-first','Process','Stop in first','Set the stop before you entered, on 25 trades.',ARRAY['Fill in the stop on the trade check before you press save.'],25,'trades','M7 3h10l4 4v10l-4 4H7l-4-4V7z M8 12h8'),
(3,'size-discipline','Process','Size discipline','Risk no more than 1R on 20 trades in a row.',ARRAY['Keep every entry at or under your 1R size.','One trade over 1R resets the count to zero.'],20,'trades','M12 4v16 M7 20h10 M4 8l8-3 8 3 M4 8l-2 6h4z M20 8l-2 6h4z'),
(4,'no-chasing','Process','No chasing','Take 10 trades in a row at or near the planned level.',ARRAY['Enter within half an R of the level you wrote in your plan.','Skip the trade when price has already run.'],10,'trades','M4 12h12 M12 7l5 5-5 5 M20 5v14'),
(5,'streak-7','Streaks','First week','Log a trade or a note on seven days in a row.',ARRAY['Open the journal once a day, even on a day you skip trading.'],7,'days','M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4'),
(6,'streak-30','Streaks','30-day streak','Keep a journal streak going for 30 days.',ARRAY['A streak freeze covers one missed day.'],30,'days','M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z'),
(7,'streak-100','Streaks','100-day streak','Keep a journal streak going for 100 days.',ARRAY['One entry a day is enough, even a one-line note.','Freezes cover missed days, two a month.'],100,'days','M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z'),
(8,'comeback','Streaks','Comeback','Log again within three days of a break of a week or more.',ARRAY['No streak needed. Just open the journal and log.'],1,'return','M4 14a8 8 0 1 1 3 6 M4 20v-6h6'),
(9,'sunday-review','Review','Sunday review x4','Finish the weekly review four weeks in a row.',ARRAY['Answer the three review questions on Sunday.'],4,'reviews','M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5'),
(10,'replay-habit','Review','Replay habit','Replay five of your closed trades.',ARRAY['Open a closed trade and press Replay, then write one line about the exit.'],5,'replays','M4 12a8 8 0 1 0 3-6.2 M4 4v5h5 M10 9l5 3-5 3z'),
(11,'mistake-fixer','Review','Mistake fixer','Do not move the stop for 10 trades in a row.',ARRAY['A moved stop resets the count.','It is the fix you picked in the Mistake lab.'],10,'trades','M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.5l3 3 5-6'),
(12,'weekly-planner','Review','Weekly planner','Lock your pre-market plan before the open on 10 trading days.',ARRAY['Lock the plan before the market opens, not after.'],10,'days','M5 4h14v17H5z M9 9h6 M9 13h6 M9 17h3'),
(13,'duo','Community','Duo badge','Both of you log for seven days in a row.',ARRAY['Invite a friend from the streak screen.','Each of you needs to log every day.'],7,'days','M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3 2.7-5 6-5s6 2 6 5 M15 15c3 0 6 2 6 5'),
(14,'good-sport','Community','Good sport','Finish a friend challenge, win or lose.',ARRAY['Accept a challenge from the streak screen and see it through.'],1,'challenge','M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z'),
(15,'mentor-graduate','Community','Mentor graduate','Finish a four-session mentor programme.',ARRAY['Join a Space and attend each session.'],4,'sessions','M2 9l10-5 10 5-10 5z M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5'),
(16,'cup-gold','Community','Cup gold','Finished in the top group of the Spring Cup, judged on rules followed.',ARRAY['Compete in a free club or global cup.','Ranked on rules followed, never on returns.'],1,'cup','M8 4h8v5a4 4 0 0 1-8 0z M12 13v4 M8 21h8 M8 6H5v2a3 3 0 0 0 3 3 M16 6h3v2a3 3 0 0 1-3 3'),
(17,'streak-14','Streaks','14-day streak','Keep a journal streak going for 14 days.',ARRAY['Keep a journal streak going for 14 days.'],14,'days','M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z'),
(18,'streak-60','Streaks','60-day streak','Keep a journal streak going for 60 days.',ARRAY['Keep a journal streak going for 60 days.'],60,'days','M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z'),
(19,'process-cup','Process','Process Cup','Keep all your rules for 30 consecutive days.',ARRAY['Keep all your rules for 30 consecutive days.'],30,'days','M8 4h8v5a4 4 0 0 1-8 0z M12 13v4 M8 21h8 M8 6H5v2a3 3 0 0 0 3 3 M16 6h3v2a3 3 0 0 1-3 3'),
(20,'rival','Community','Rival','Earn the Rival badge in a process challenge.',ARRAY['Earn the Rival badge in a process challenge.'],1,'challenge','M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z');

ALTER TABLE badges_earned ADD COLUMN portfolio_visible boolean NOT NULL DEFAULT false;
