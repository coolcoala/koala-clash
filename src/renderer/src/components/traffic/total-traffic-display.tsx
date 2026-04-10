import React from 'react'
import { useTotalTraffic } from '@renderer/hooks/use-total-traffic'
import { calcTraffic } from '@renderer/utils/calc'
import { Button } from '@renderer/components/ui/button'

const TotalTrafficDisplay: React.FC = () => {
  const { totalUp, totalDown, reset } = useTotalTraffic()

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border">
      <h3 className="font-semibold">Использовано трафика</h3>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-500">Загружено</p>
          <p className="text-lg font-bold">{calcTraffic(totalUp)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Скачано</p>
          <p className="text-lg font-bold">{calcTraffic(totalDown)}</p>
        </div>
      </div>
      <Button onClick={reset} size="sm" variant="outline">
        Обнулить
      </Button>
    </div>
  )
}

export default TotalTrafficDisplay
