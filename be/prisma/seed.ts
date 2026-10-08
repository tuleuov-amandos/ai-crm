// be/prisma/seed.ts
import * as bcrypt from 'bcrypt'
import { PrismaClient } from '../generated/prisma-client/client'
import { DealStage, ActivityType, AiSuggestionType } from '../generated/prisma-client/enums'
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { getDatabaseSsl } from 'src/common/utils/database-ssl.util'
import { createDefaultStages, resolveStageIdByLegacyKey } from 'src/common/pipeline-stages/default-pipeline-stages'

// Жёсткий предохранитель: seed стирает и перезаписывает данные (main() начинается
// с deleteMany по всем таблицам). В production это недопустимо — прерываемся до
// любого подключения к БД, независимо от того, как запущен файл.
if (process.env.NODE_ENV === 'production') {
  console.error('❌ prisma/seed.ts запрещён в production (NODE_ENV=production). Прерываю.')
  process.exit(1)
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? getDatabaseSsl(process.env.DATABASE_URL) : undefined,
})

const prisma = new PrismaClient({ adapter })

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getRandomPhone(): string {
  const prefixes = ['701', '702', '705', '707', '747', '775', '777']
  const randomDigits = Math.floor(1000000 + Math.random() * 9000000).toString()
  return '+7' + getRandomElement(prefixes) + randomDigits
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

function transliterate(str: string): string {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('')
}

// Helper to generate weighted month: mostly concentrated in May, June, July and less in Jan - Apr
function getRandomWeightedMonth(): number {
  const months = [
    1, 1,             // January (weight 2)
    2, 2,             // February (weight 2)
    3, 3, 3,          // March (weight 3)
    4, 4, 4,          // April (weight 3)
    5, 5, 5, 5, 5,    // May (weight 5)
    6, 6, 6, 6, 6, 6, // June (weight 6)
    7, 7, 7, 7, 7, 7, 7, 7 // July - Current month (weight 8)
  ]
  return getRandomElement(months)
}

async function main() {
  console.log('🌱 Очистка старых данных...')
  await prisma.aiSuggestion.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.activity.deleteMany({})
  await prisma.deal.deleteMany({})
  await prisma.pipelineStage.deleteMany({})
  await prisma.contact.deleteMany({})
  await prisma.kpiTarget.deleteMany({})
  await prisma.refreshToken.deleteMany({})
  await prisma.invitation.deleteMany({})
  await prisma.rolePermission.deleteMany({})
  await prisma.permission.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.role.deleteMany({})
  await prisma.tenant.deleteMany({})

  console.log('🌱 Создание тестовых данных...')

  // 1. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Компания АВС',
      slug: 'kompaniya-abc',
      plan: 'pro',
    },
  })
  await createDefaultStages(prisma, tenant.id)

  // 2. Create system Permissions list
  const permissionsList = [
    { action: 'manage', subject: 'all', description: 'Полный доступ к системе' },
    
    { action: 'create', subject: 'Contact', description: 'Создание контактов' },
    { action: 'read', subject: 'Contact', description: 'Просмотр контактов' },
    { action: 'update', subject: 'Contact', description: 'Редактирование контактов' },
    { action: 'delete', subject: 'Contact', description: 'Удаление контактов' },

    { action: 'create', subject: 'Deal', description: 'Создание сделок' },
    { action: 'read', subject: 'Deal', description: 'Просмотр сделок' },
    { action: 'update', subject: 'Deal', description: 'Редактирование сделок' },
    { action: 'delete', subject: 'Deal', description: 'Удаление сделок' },

    { action: 'create', subject: 'Task', description: 'Создание задач' },
    { action: 'read', subject: 'Task', description: 'Просмотр задач' },
    { action: 'update', subject: 'Task', description: 'Редактирование задач' },
    { action: 'delete', subject: 'Task', description: 'Удаление задач' },

    { action: 'create', subject: 'Activity', description: 'Создание активностей' },
    { action: 'read', subject: 'Activity', description: 'Просмотр активностей' },
    { action: 'update', subject: 'Activity', description: 'Редактирование активностей' },
    { action: 'delete', subject: 'Activity', description: 'Удаление активностей' },

    { action: 'read', subject: 'Report', description: 'Просмотр аналитики и отчётов' },
    { action: 'read', subject: 'KpiTarget', description: 'Просмотр KPI по продажам' },
    { action: 'update', subject: 'KpiTarget', description: 'Редактирование KPI по продажам' },
  ]

  for (const perm of permissionsList) {
    await prisma.permission.upsert({
      where: { action_subject: { action: perm.action, subject: perm.subject } },
      update: {},
      create: perm,
    })
  }

  // 3. Create default Roles for the Tenant.
  // No `description` — see shared-user.repo.ts: built-in role descriptions are
  // rendered from fe translations, not stored per-language in the DB.
  const adminRole = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'ADMIN' }
  })
  const managerRole = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'MANAGER' }
  })
  const salesRepRole = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'SALES_REP' }
  })

  // 4. Associate permissions for ADMIN (manage:all)
  const dbManageAll = await prisma.permission.findUnique({
    where: { action_subject: { action: 'manage', subject: 'all' } }
  })
  if (dbManageAll) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: dbManageAll.id }
    })
  }

  // 5. Associate permissions for MANAGER (read/write all Contacts, Deals, Tasks, Activities)
  const allDomainPerms = await prisma.permission.findMany({
    where: { subject: { in: ['Contact', 'Deal', 'Task', 'Activity'] } }
  })
  for (const perm of allDomainPerms) {
    await prisma.rolePermission.create({
      data: { roleId: managerRole.id, permissionId: perm.id }
    })
  }

  // Grant additional Report & KpiTarget permissions to MANAGER
  const managerExtraPerms = await prisma.permission.findMany({
    where: {
      OR: [
        { action: 'read', subject: 'Report' },
        { action: 'read', subject: 'KpiTarget' },
        { action: 'update', subject: 'KpiTarget' },
      ]
    }
  })
  for (const perm of managerExtraPerms) {
    await prisma.rolePermission.create({
      data: { roleId: managerRole.id, permissionId: perm.id }
    })
  }

  // 6. Set up ABAC permissions for SALES_REP (Only view/edit owned entities)
  for (const perm of allDomainPerms) {
    const isSubjectRestricted = ['Contact', 'Deal', 'Activity'].includes(perm.subject)
    await prisma.rolePermission.create({
      data: {
        roleId: salesRepRole.id,
        permissionId: perm.id,
        conditions: isSubjectRestricted 
          ? (perm.subject === 'Activity' ? { userId: '${user.id}' } : { ownerId: '${user.id}' })
          : undefined
      }
    })
  }

  // Grant limited Report & KpiTarget viewing permissions to SALES_REP
  const readReportPerm = await prisma.permission.findUnique({
    where: { action_subject: { action: 'read', subject: 'Report' } }
  })
  if (readReportPerm) {
    await prisma.rolePermission.create({
      data: {
        roleId: salesRepRole.id,
        permissionId: readReportPerm.id,
        conditions: { view: { $in: ['team', 'activity'] } }
      }
    })
  }

  const readKpiTargetPerm = await prisma.permission.findUnique({
    where: { action_subject: { action: 'read', subject: 'KpiTarget' } }
  })
  if (readKpiTargetPerm) {
    await prisma.rolePermission.create({
      data: {
        roleId: salesRepRole.id,
        permissionId: readKpiTargetPerm.id,
        conditions: { userId: '${user.id}' }
      }
    })
  }

  // 7. Create mock Users (using dynamic roleId)
  const hashedPassword = await bcrypt.hash('Password123!', 10)

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'admin@abc.com',
      password: hashedPassword,
      name: 'Алексей Админов',
      roleId: adminRole.id,
    },
  })

  const manager = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'manager@abc.com',
      password: hashedPassword,
      name: 'Мария Менеджерова',
      roleId: managerRole.id,
    },
  })

  const salesRepsData = [
    { email: 'sales@abc.com', name: 'Сергей Продавцов' },
    { email: 'anna@abc.com', name: 'Анна Петрова' },
    { email: 'dmitry@abc.com', name: 'Дмитрий Козлов' },
    { email: 'elena@abc.com', name: 'Елена Смирнова' },
    { email: 'igor@abc.com', name: 'Игорь Волков' },
    { email: 'olga@abc.com', name: 'Ольга Новикова' },
  ]

  const salesReps: any[] = []
  for (const rep of salesRepsData) {
    const r = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: rep.email,
        password: hashedPassword,
        name: rep.name,
        roleId: salesRepRole.id,
      },
    })
    salesReps.push(r)
  }

  const allTeamUsers = [manager, ...salesReps]

  // 8. Create Contacts (30 Contacts) with tag data
  const companyNames = [
    'Альфа Технологии', 'Северный Банк', 'Прогресс Софт', 'Группа Горизонт', 'Мегаполис Телеком',
    'Восток Капитал', 'Сибирский Молочный Дом', 'Центр Электроники', 'Рассвет Корпорация', 'Холдинг Атлант'
  ]
  const contactFirstNames = ['Алексей', 'Елена', 'Анна', 'Дмитрий', 'Игорь', 'Ольга', 'Андрей', 'Максим']
  const contactLastNames = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Попов']
  const positions = ['CEO', 'CTO', 'ИТ-директор', 'Руководитель отдела закупок']
  const contactTagsList = ['Enterprise', 'Vip', 'Potential']

  const contacts: any[] = []
  for (let i = 1; i <= 30; i++) {
    const owner = getRandomElement(salesReps)
    const company = getRandomElement(companyNames)
    const firstName = getRandomElement(contactFirstNames)
    const lastName = getRandomElement(contactLastNames)
    const fullName = `${lastName} ${firstName}`
    
    const cleanFirstName = transliterate(firstName).replace(/\s+/g, '')
    const cleanCompany = transliterate(company).replace(/[^a-z0-9]/g, '')
    const email = `${cleanFirstName}.${getRandomInt(10, 99)}@${cleanCompany}.com`

    // Select 1-3 random tags
    const tagsCount = getRandomInt(1, 3)
    const selectedTags: string[] = []
    while (selectedTags.length < tagsCount) {
      const tag = getRandomElement(contactTagsList)
      if (!selectedTags.includes(tag)) selectedTags.push(tag)
    }
    
    const contact = await prisma.contact.create({
      data: {
        id: `contact-seed-${String(i).padStart(3, '0')}`,
        tenantId: tenant.id,
        ownerId: owner.id,
        name: fullName,
        email,
        phone: getRandomPhone(),
        company,
        position: getRandomElement(positions),
        tags: selectedTags, // Add tags to database
      },
    })
    contacts.push(contact)
  }

  // 9. Create Deals (45 Deals) with weighted monthly distribution (mostly May-Jul 2026)
  const dealStages = [
    DealStage.PROSPECT, DealStage.QUALIFIED, DealStage.PROPOSAL, DealStage.CLOSED_WON, DealStage.CLOSED_LOST
  ]
  const dealTitles = ['Внедрение ERP', 'Интеграция платёжного API', 'Обновление облачного сервера', 'Договор на обслуживание', 'Разработка мобильного приложения']
  const deals: any[] = []
  const currentYear = 2026

  for (let i = 1; i <= 45; i++) {
    const contact = getRandomElement(contacts)
    const ownerId = contact.ownerId
    const title = `${getRandomElement(dealTitles)} - ${contact.company}`
    const value = getRandomInt(15, 85) * 10_000_000
    
    let stage: DealStage
    let createdAt: Date
    
    if (i <= 15) {
      // 15 Deals in current month (7/1 -> 7/8/2026) to avoid future dates (>7/9)
      // Each stage has exactly 3 deals
      const stageIndex = Math.floor((i - 1) / 3)
      stage = dealStages[stageIndex]
      
      const day = getRandomInt(1, 8)
      createdAt = new Date(currentYear, 6, day) // July (index 6)
    } else if (i <= 30) {
      // 15 Deals in previous month (June 2026)
      const stageIndex = Math.floor((i - 16) / 3)
      stage = dealStages[stageIndex]
      
      const day = getRandomInt(1, 28)
      createdAt = new Date(currentYear, 5, day) // June (index 5)
    } else {
      // 15 Deals in earlier months (January -> May 2026)
      stage = getRandomElement(dealStages)
      const month = getRandomInt(1, 5) // Month 1 -> 5
      const day = getRandomInt(1, 28)
      createdAt = new Date(currentYear, month - 1, day)
    }

    let closeDate: Date | null = null
    if (stage === DealStage.CLOSED_WON || stage === DealStage.CLOSED_LOST) {
      // Ensure close date of July deals is before July 9
      const dealDay = createdAt.getDate()
      const closeDay = stage === DealStage.CLOSED_WON && createdAt.getMonth() === 6 
        ? getRandomInt(dealDay, 9) 
        : getRandomInt(dealDay, dealDay + 15)
      closeDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), closeDay)
    } else {
      closeDate = new Date(createdAt.getTime() + getRandomInt(30, 60) * 24 * 60 * 60 * 1000)
    }

    const deal = await prisma.deal.create({
      data: {
        id: `deal-seed-${String(i).padStart(3, '0')}`,
        tenantId: tenant.id,
        contactId: contact.id,
        ownerId,
        title,
        value,
        stage,
        stageId: await resolveStageIdByLegacyKey(prisma, tenant.id, stage),
        closeDate,
        createdAt,
        note: `Потенциальная сделка с контактом ${contact.name}`,
      },
    })
    deals.push(deal)
  }

  // 10. Create Activities (60 Activities)
  const activityTypes = [ActivityType.CALL, ActivityType.EMAIL, ActivityType.MEETING, ActivityType.NOTE]
  const activityNotes = {
    [ActivityType.CALL]: ['Звонок: презентация услуг и предварительная оценка стоимости.', 'Звонок: подробное обсуждение индивидуальных требований.', 'Звонок после отправки коммерческого предложения.'],
    [ActivityType.EMAIL]: ['Отправлена брошюра с продуктом и подробный расчёт стоимости.', 'Письмо с уточнением отдельных пунктов договора.', 'Письмо с итогами встречи.'],
    [ActivityType.MEETING]: ['Онлайн-демонстрация продукта в Zoom/Meet.', 'Личная встреча по согласованию условий.', 'Встреча по обследованию текущей инфраструктуры.'],
    [ActivityType.NOTE]: ['Клиент, судя по всему, приоритетно рассматривает быстрое внедрение.', 'Конкурент предлагает цену ниже, но поддержка у него слабее.', 'Техническая заметка: нужно дополнительно интегрировать платёжный шлюз.']
  }

  for (let i = 1; i <= 60; i++) {
    const deal = getRandomElement(deals)
    const type = getRandomElement(activityTypes)
    const note = getRandomElement(activityNotes[type])
    
    const dealDate = new Date(deal.createdAt)
    let activityDate: Date
    
    if (dealDate.getMonth() === 6) {
      // If deal was created in July, limit activities to range dealDate -> July 9
      const dealDay = dealDate.getDate()
      activityDate = new Date(2026, 6, getRandomInt(dealDay, 9))
    } else {
      activityDate = new Date(dealDate.getTime() + getRandomInt(1, 10) * 24 * 60 * 60 * 1000)
    }

    await prisma.activity.create({
      data: {
        id: `activity-seed-${String(i).padStart(3, '0')}`,
        tenantId: tenant.id,
        contactId: deal.contactId,
        dealId: deal.id,
        userId: deal.ownerId,
        title: type === ActivityType.CALL ? 'Звонок клиенту' : type === ActivityType.EMAIL ? 'Отправка письма' : type === ActivityType.MEETING ? 'Встреча' : 'Заметка по сделке',
        type,
        note,
        date: activityDate,
      },
    })
  }

  // 11. Create Tasks (60 Tasks)
  const taskTitles = ['Отправить коммерческое предложение', 'Подготовить слайды для демо', 'Позвонить клиенту', 'Согласовать договор', 'Настроить тестовое окружение']

  for (let i = 1; i <= 60; i++) {
    const deal = getRandomElement(deals)
    const title = getRandomElement(taskTitles)
    const done = Math.random() > 0.4

    const dealDate = new Date(deal.createdAt)
    let dueDate: Date
    
    if (dealDate.getMonth() === 6) {
      // Some July tasks will have deadlines in the near future (e.g. July 10, 11, 12) to show "Upcoming activities"
      if (!done) {
        dueDate = new Date(2026, 6, getRandomInt(10, 12))
      } else {
        dueDate = new Date(2026, 6, getRandomInt(dealDate.getDate(), 9))
      }
    } else {
      dueDate = new Date(dealDate.getTime() + getRandomInt(5, 20) * 24 * 60 * 60 * 1000)
    }

    await prisma.task.create({
      data: {
        id: `task-seed-${String(i).padStart(3, '0')}`,
        tenantId: tenant.id,
        dealId: deal.id,
        title,
        done,
        dueDate,
        createdAt: dealDate,
      },
    })
  }

  // 12. AI Suggestions (5 suggestions)
  const topDealsForAi = deals.slice(0, 5)
  for (const deal of topDealsForAi) {
    await prisma.aiSuggestion.create({
      data: {
        tenantId: tenant.id,
        jobId: `job-ai-${deal.id}`,
        dealId: deal.id,
        type: AiSuggestionType.EMAIL_DRAFT,
        content: `Уважаемый партнёр, благодарим вас за обсуждение сделки «${deal.title}». Ниже — проект предложения по решению...`,
        sourceNote: 'Клиент положительно отреагировал на демонстрацию.',
      },
    })
  }

  // 13. KPI Targets (72 Target Records - 12 Months * 7 Users)
  for (const user of allTeamUsers) {
    for (let month = 1; month <= 12; month++) {
      const target = getRandomInt(15, 50) * 10_000_000
      await prisma.kpiTarget.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          month,
          year: currentYear,
          target,
        },
      })
    }
  }

  // 14. Print beautiful sample data statistics
  const usersCount = await prisma.user.count()
  const rolesCount = await prisma.role.count()
  const permissionsCount = await prisma.permission.count()
  const contactsCount = await prisma.contact.count()
  const dealsCount = await prisma.deal.count()
  const activitiesCount = await prisma.activity.count()
  const tasksCount = await prisma.task.count()
  const aiSuggestionsCount = await prisma.aiSuggestion.count()
  const kpiTargetsCount = await prisma.kpiTarget.count()

  console.log(`
========================================================================
📊 СВОДКА ПО ТЕСТОВЫМ ДАННЫМ (TENANT: ${tenant.name})
========================================================================
🏢 Tenant ID:        ${tenant.id}
💼 Plan:             ${tenant.plan.toUpperCase()}
🔑 Роли и права:
   - Ролей:          ${rolesCount} (ADMIN, MANAGER, SALES_REP)
   - Прав:           ${permissionsCount} (связаны через RolePermission)
👥 Учётные записи (пароль по умолчанию: Password123!):
   - [ADMIN] Алексей Админов      | Email: admin@abc.com   | Права: manage -> all
   - [MANAGER] Мария Менеджерова  | Email: manager@abc.com | Права: CRUD по всей компании
   - [SALES_REP] Сергей Продавцов | Email: sales@abc.com   | ABAC (только свои данные)
   - [SALES_REP] Анна Петрова     | Email: anna@abc.com    | ABAC (только свои данные)
   - [SALES_REP] Дмитрий Козлов   | Email: dmitry@abc.com  | ABAC (только свои данные)
   - [SALES_REP] Елена Смирнова   | Email: elena@abc.com   | ABAC (только свои данные)
   - [SALES_REP] Игорь Волков     | Email: igor@abc.com    | ABAC (только свои данные)
   - [SALES_REP] Ольга Новикова   | Email: olga@abc.com    | ABAC (только свои данные)
📈 Созданные бизнес-сущности:
   - 📞 Contacts (контакты):    ${contactsCount} (со случайными тегами)
   - 🤝 Deals (сделки):         ${dealsCount} (распределены по месяцам 5, 6, 7/2026)
   - 📅 Activities (активности): ${activitiesCount}
   - 📝 Tasks (задачи):         ${tasksCount}
   - 🧠 AI Suggestions:        ${aiSuggestionsCount}
   - 🎯 KPI Target Records:     ${kpiTargetsCount}
========================================================================
  `);

  console.log('✅ Seed успешно выполнен!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log('✅ Seed завершён!')
  })
