import { expect, test } from '@playwright/test'

test.describe('Fluxo crítico do app Taro', () => {
  test('inicia leitura, registra carta manualmente e salva sessão', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Iniciar Tiragem' }).click()

    await page.getByLabel('Nome completo (Pessoa 1) *').fill('Teste E2E')
    await page.getByLabel('Sexo *').selectOption('masculino')
    await page
      .getByLabel('Qual é a principal situação que te trouxe aqui hoje? *')
      .fill('Validar fluxo crítico automatizado.')
    await page
      .getByRole('button', { name: 'Registrar dados e escolher tiragem' })
      .click()

    await page.getByRole('button', { name: /Uma Carta/ }).click()
    await page.getByRole('button', { name: /Mostrar funções/ }).click()

    const manualSelect = page.locator('#manual-card')
    await expect(manualSelect).toBeVisible()
    await expect.poll(async () => manualSelect.locator('option').count()).toBeGreaterThan(1)
    const firstCardValue = await manualSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute('value')
    expect(firstCardValue).toBeTruthy()
    await manualSelect.selectOption(firstCardValue!)
    await expect(manualSelect).toHaveValue(firstCardValue!)
    await page.locator('.manual-row button', { hasText: 'Registrar' }).click()

    const saveButton = page.getByRole('button', { name: 'Salvar sessão' })
    await expect(saveButton).toBeEnabled()
    await saveButton.click()
    await expect(page.getByText('Sessão salva no histórico local.')).toBeVisible()

    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.getByRole('button', { name: 'Voltar ao menu' }).click()

    await expect(page.getByText('1 carta(s) registradas')).toBeVisible()
  })
})
