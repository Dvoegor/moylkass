const express = require('express');
const moment = require('moment');

const app = express();
const knex = require('./conn');
const PORT = 3000;

app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(express.json());

app.get('/', async (req, res) => {
  const params = req.query;
  const dates = params.date ? params.date.split(',') : false;
  const status = params.status ? params.status : false;
  const teacherIds = params.teacherIds ? params.teacherIds.split(',') : false;
  const studentsCount = params.studentsCount
    ? params.studentsCount.split(',')
    : false;
  const page = params.page ? params.page : 1;
  const lessonsPerPage = params.lessonsPerPage ? params.lessonsPerPage : 5;

  await knex('lessons')
    .leftJoin('lesson_students', 'lesson_students.lesson_id', 'lessons.id')
    .leftJoin('students', 'lesson_students.student_id', 'students.id')
    .leftJoin('lesson_teachers', 'lesson_teachers.lesson_id', 'lessons.id')
    .leftJoin('teachers', 'lesson_teachers.teacher_id', 'teachers.id')
    .select([
      'lessons.id',
      'lessons.date',
      'lessons.title',
      'lessons.status',
      knex.raw(
        `case 
            when COUNT(DISTINCT lesson_students.student_id) = 0 then 0 
            else (COUNT(case lesson_students.visit when 'true' then 1 else null end) / (COUNT(lesson_students.visit) / COUNT(DISTINCT lesson_students.student_id)))::INTEGER 
          end 
          as "visitCount"`
      ),
      knex.raw(
        `case 
            when COUNT(DISTINCT lesson_students.student_id) = 0 then '[]' 
            else JSON_AGG(DISTINCT jsonb_build_object('id', lesson_students.student_id , 'name' , students.name, 'visit' , lesson_students.visit)) 
          end 
          as "students"`
      ),
      knex.raw(
        `case 
          when COUNT(DISTINCT teachers.id) = 0 then '[]'
          else JSON_AGG(DISTINCT jsonb_build_object('id', teachers.id , 'name' , teachers.name)) 
        end 
        as "teachers"`
      ),
    ])
    .modify(function (queryBuilder) {
      if (dates) {
        if (dates.length === 2) {
          queryBuilder.whereBetween('date', dates);
        } else {
          queryBuilder.where('date', dates);
        }
      }
    })
    .modify(function (queryBuilder) {
      if (status) {
        queryBuilder.where('status', status);
      }
    })
    .modify(function (queryBuilder) {
      if (teacherIds) {
        queryBuilder.whereIn('teacher_id', teacherIds);
      }
    })
    .modify(function (queryBuilder) {
      if (studentsCount) {
        if (studentsCount.length === 2) {
          queryBuilder.havingBetween(
            knex.raw(`COUNT(DISTINCT lesson_students.student_id)`),
            studentsCount
          );
        } else {
          queryBuilder.having(
            knex.raw(`COUNT(DISTINCT lesson_students.student_id)`),
            '=',
            studentsCount[0]
          );
        }
      }
    })
    .groupBy('lessons.id', 'lessons.date', 'lessons.title', 'lessons.status')
    .limit(lessonsPerPage)
    .offset(lessonsPerPage * (page - 1))
    .then((data) => res.send(data))
    .catch((err) => {
      res.status(400).send(err);
    });
});

app.post('/lessons', async (req, res) => {
  const body = req.body;
  const teacherIds = body.teacherIds;
  const title = body.title;
  const daysArr = req.body.days;
  const firstDate = moment(body.firstDate, 'YYYY-MM-DD');
  const lastDate = body.lastDate ? moment(body.lastDate, 'YYYY-MM-DD') : false;
  const lessonsCount = body.lessonsCount ? body.lessonsCount : false;

  const getDaysBetweenDates = function (startDate, endDate) {
    let now = startDate.clone(),
      dates = [];

    while (now.isSameOrBefore(endDate)) {
      if (dates.length === 300) break;
      if (daysArr.includes(moment(now).day())) {
        dates.push(now.format('YYYY-MM-DD'));
      }
      now.add(1, 'days');
    }
    return dates;
  };

  const getDaysByLessonsCount = function (startDate, lessonsCount) {
    let now = startDate.clone(),
      dates = [],
      count = 0,
      endDate = startDate.clone().add(1, 'y');

    while (count < lessonsCount) {
      if (now.isSameOrAfter(endDate)) break;
      if (daysArr.includes(moment(now).day())) {
        dates.push(now.format('YYYY-MM-DD'));
        count++;
      }
      now.add(1, 'days');
    }
    return dates;
  };

  const allDatesList = lessonsCount
    ? getDaysByLessonsCount(firstDate, lessonsCount)
    : getDaysBetweenDates(firstDate, lastDate);

  Promise.all(
    await allDatesList.map(async (date) => {
      await knex('lessons')
        .insert({ title: title, date: date })
        .returning('id')
        .then(function (id) {
          date = id[0];
          const fieldsToInsert = teacherIds.map((teacherId) => ({
            lesson_id: id[0],
            teacher_id: teacherId,
          }));
          knex('lesson_teachers')
            .insert(fieldsToInsert)
            .then(() => {});
        });
      return date;
    })
  )
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.status(400).send(err);
    });
});

app.listen(PORT, () => {
  console.log(`App running on port ${PORT}.`);
});
