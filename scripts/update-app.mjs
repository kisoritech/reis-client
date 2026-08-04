import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: false,
  })

  if (result.error?.code === 'ENOENT') {
    throw new Error(`O comando "${command}" nao esta instalado ou nao esta no PATH.`)
  }
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout).trim() : ''
    throw new Error(detail || `Falha ao executar: ${command} ${args.join(' ')}`)
  }
  return options.capture ? result.stdout.trim() : ''
}

function git(...args) {
  return run('git', args, { capture: true })
}

try {
  console.log(`Validando ambiente em ${projectRoot}`)
  console.log(git('--version'))

  const repositoryRoot = resolve(git('rev-parse', '--show-toplevel'))
  if (repositoryRoot.toLowerCase() !== projectRoot.toLowerCase()) {
    throw new Error('Execute o atualizador a partir do repositorio REIS Client.')
  }

  const changes = git('status', '--porcelain')
  if (changes) {
    throw new Error(
      'Existem alteracoes locais. Faca commit ou stash antes de atualizar para evitar perda de trabalho.',
    )
  }

  const branch = git('branch', '--show-current')
  if (!branch) throw new Error('O repositorio esta em detached HEAD; selecione uma branch antes de atualizar.')

  console.log(`Consultando atualizacoes para ${branch}...`)
  run('git', ['fetch', '--prune', 'origin'])

  const remoteRef = `origin/${branch}`
  git('rev-parse', '--verify', remoteRef)
  const behind = Number(git('rev-list', '--count', `HEAD..${remoteRef}`))
  const ahead = Number(git('rev-list', '--count', `${remoteRef}..HEAD`))

  if (ahead > 0) {
    throw new Error(
      `A branch local possui ${ahead} commit(s) ainda nao enviados. Envie-os antes de atualizar.`,
    )
  }
  if (behind === 0) {
    console.log('A aplicacao ja esta atualizada.')
    process.exit(0)
  }
  if (checkOnly) {
    console.log(`Atualizacao disponivel: ${behind} commit(s). Execute "npm run app:update".`)
    process.exit(0)
  }

  const lockPath = resolve(projectRoot, 'package-lock.json')
  const oldLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null

  console.log(`Aplicando ${behind} commit(s) em modo fast-forward...`)
  run('git', ['merge', '--ff-only', remoteRef])

  const newLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null
  if (oldLock !== newLock) {
    console.log('Dependencias alteradas; executando npm ci...')
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'])
  }

  console.log('REIS Client atualizado com sucesso.')
} catch (error) {
  console.error(`Atualizacao cancelada: ${error.message}`)
  process.exit(1)
}
