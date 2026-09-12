import 'dotenv/config'
import * as bcrypt from 'bcrypt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma-client/client'
import { getDatabaseSsl } from '../src/common/utils/database-ssl.util'

/**
 * One-shot: create the first PlatformAdmin account. There is no self-service
 * registration for platform admins (unlike tenant users) — this script is the
 * only way to seed one.
 *
 * Usage:
 *   npm run create-platform-admin -- admin@nstore.kz "пароль" "Имя Фамилия"
 */

// Same algorithm/salt rounds as HashingService (src/common/services/hashing.service.ts),
// duplicated here because this script runs outside the Nest DI container.
const SALT_ROUNDS = 10

async function main() {
  const [email, password, name] = process.argv.slice(2)

  if (!email || !password || !name) {
    console.error('✗ Usage: npm run create-platform-admin -- <email> <password> <name>')
    process.exit(1)
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? getDatabaseSsl(process.env.DATABASE_URL) : undefined,
  })
  const prisma = new PrismaClient({ adapter })

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

  const admin = await prisma.platformAdmin.create({
    data: { email, password: hashedPassword, name },
  })

  console.log(`✓ platform admin created: id=${admin.id} email=${admin.email} name=${admin.name}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('✗ failed to create platform admin:', err)
  process.exit(1)
})
