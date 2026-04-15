import React from 'react'

export default function Logo() {
    return (
        <div style={ { textAlign: 'center', padding: '20px' } }>
            <img
                src="/logo.png"
                alt="Logo"
                style={ {
                    maxHeight: '100px',
                    maxWidth: '400px',
                    width: 'auto',
                    height: 'auto'
                } }
            />
        </div>
    )
}
